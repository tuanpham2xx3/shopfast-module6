import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import Redis from "ioredis";
import * as jwt from "jsonwebtoken";
import { Namespace, Server, Socket } from "socket.io";
import { DataSource } from "typeorm";
import { z } from "zod";
import { createDataSource } from "../../../../platform/src/database/data-source";
import {
  domainEvents,
  OrderStatusEvent,
} from "../../../../platform/src/domain-events";
import { AuthRuntime } from "../../../auth/src/composition/auth.runtime";

@Injectable()
export class OrderRealtime
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private io?: Server;
  private ns?: Namespace;
  private source?: DataSource;
  private pending?: Promise<DataSource>;
  private subscriber?: Redis;
  private timer?: NodeJS.Timeout;
  private readonly attempts = new Map<string, number[]>();
  private readonly expiries = new Map<string, NodeJS.Timeout>();
  constructor(
    private readonly adapter: HttpAdapterHost,
    private readonly auth: AuthRuntime,
  ) {}
  private db() {
    return (this.pending ??= (async () => {
      this.source = await createDataSource(
        process.env.DATABASE_URL!,
        process.env.DATABASE_SCHEMA ?? "public",
      ).initialize();
      return this.source;
    })().catch((e) => {
      this.pending = undefined;
      throw e;
    }));
  }
  onApplicationBootstrap() {
    this.io = new Server(this.adapter.httpAdapter.getHttpServer(), {
      cors: {
        origin: process.env.WEB_ORIGIN ?? "http://127.0.0.1:5173",
        credentials: true,
      },
      maxHttpBufferSize: 8192,
    });
    this.ns = this.io.of("/orders");
    this.ns.use(async (socket, next) => {
      try {
        if (socket.handshake.query.token) throw new Error();
        const token = socket.handshake.auth.token;
        if (typeof token !== "string" || token.length > 4096) throw new Error();
        const user = await (await this.auth.get()).currentUser(token);
        if (!user.verified || user.role !== "CUSTOMER") throw new Error();
        const claims = jwt.decode(token) as jwt.JwtPayload;
        if (typeof claims.sid !== "string" || !claims.exp) throw new Error();
        if (
          [...this.ns!.sockets.values()].filter(
            (s) => s.data.sid === claims.sid,
          ).length >= 5
        )
          throw new Error();
        socket.data = {
          token,
          user,
          sid: claims.sid,
          exp: claims.exp,
          subscriptions: new Set<string>(),
        };
        next();
      } catch {
        next(new Error("AUTHENTICATION_REQUIRED"));
      }
    });
    this.ns.on("connection", (socket) => {
      this.expiries.set(
        socket.id,
        setTimeout(
          () => socket.disconnect(true),
          Math.max(1, socket.data.exp * 1000 - Date.now()),
        ),
      );
      socket.on("order.subscribe", (payload: unknown, ack?: unknown) => {
        void this.subscribe(socket, payload)
          .then((result) => {
            if (typeof ack === "function") ack(result);
          })
          .catch(() => {
            if (typeof ack === "function")
              ack({ ok: false, code: "NOT_FOUND" });
          });
      });
      socket.on("order.unsubscribe", (payload: unknown) => {
        const parsed = z
          .object({ orderId: z.string().uuid() })
          .strict()
          .safeParse(payload);
        if (parsed.success) {
          socket.data.subscriptions.delete(parsed.data.orderId);
          void socket.leave(`order:${parsed.data.orderId}`);
        }
      });
      socket.on("disconnect", () => {
        clearTimeout(this.expiries.get(socket.id));
        this.expiries.delete(socket.id);
        if (
          ![...this.ns!.sockets.values()].some(
            (s) => s.data.sid === socket.data.sid,
          )
        )
          this.attempts.delete(socket.data.sid);
      });
    });
    domainEvents.on("order.status.updated", this.forward);
    domainEvents.on("session.revoked", this.revoke);
    this.timer = setInterval(() => {
      for (const socket of this.ns?.sockets.values() ?? [])
        void this.validate(socket);
    }, 30000);
    this.timer.unref();
    if (process.env.REDIS_URL && process.env.NODE_ENV !== "test") {
      this.subscriber = new Redis(process.env.REDIS_URL, {
        lazyConnect: true,
        connectTimeout: 1000,
        maxRetriesPerRequest: 1,
        retryStrategy: () => 5000,
      });
      this.subscriber.on("error", () => undefined);
      this.subscriber.on("message", (_channel, payload) => {
        try {
          const event = z
            .object({
              eventId: z.string().uuid(),
              orderId: z.string().uuid(),
              status: z.string(),
              version: z.number().int().positive(),
              occurredAt: z.string().datetime(),
            })
            .strict()
            .parse(JSON.parse(payload));
          this.forward(event);
        } catch {
          /* Untrusted pub/sub data is discarded. */
        }
      });
      void this.subscriber
        .subscribe("shopfast:order-events")
        .catch(() => undefined);
    }
  }
  private async validate(socket: Socket) {
    try {
      const user = await (await this.auth.get()).currentUser(socket.data.token);
      if (!user.verified || user.role !== "CUSTOMER") throw new Error();
      return true;
    } catch {
      socket.disconnect(true);
      return false;
    }
  }
  private async subscribe(socket: Socket, payload: unknown) {
    const times = (this.attempts.get(socket.data.sid) ?? []).filter(
      (t) => t > Date.now() - 60000,
    );
    times.push(Date.now());
    this.attempts.set(socket.data.sid, times);
    if (times.length > 30) return { ok: false, code: "RATE_LIMITED" };
    const parsed = z
      .object({ orderId: z.string().uuid() })
      .strict()
      .safeParse(payload);
    if (!parsed.success || !(await this.validate(socket)))
      return { ok: false, code: "NOT_FOUND" };
    const ids: Set<string> = socket.data.subscriptions;
    if (ids.size >= 10 && !ids.has(parsed.data.orderId))
      return { ok: false, code: "SUBSCRIPTION_LIMIT" };
    const schema = process.env.DATABASE_SCHEMA ?? "public";
    const [order] = await (
      await this.db()
    ).query(
      `SELECT version FROM "${schema}".orders WHERE id=$1 AND customer_id=$2`,
      [parsed.data.orderId, socket.data.user.id],
    );
    if (!order) return { ok: false, code: "NOT_FOUND" };
    await socket.join(`order:${parsed.data.orderId}`);
    ids.add(parsed.data.orderId);
    return {
      ok: true,
      orderId: parsed.data.orderId,
      currentVersion: order.version,
    };
  }
  private readonly forward = (event: OrderStatusEvent) => {
    for (const socket of this.ns?.sockets.values() ?? []) {
      if (socket.data.subscriptions?.has(event.orderId))
        void this.validate(socket).then((valid) => {
          if (valid && socket.connected)
            socket.emit("order.status.updated", event);
        });
    }
  };
  private readonly revoke = (sid: string) => {
    for (const socket of this.ns?.sockets.values() ?? [])
      if (socket.data.sid === sid) socket.disconnect(true);
  };
  async onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    for (const timer of this.expiries.values()) clearTimeout(timer);
    domainEvents.off("order.status.updated", this.forward);
    domainEvents.off("session.revoked", this.revoke);
    this.subscriber?.disconnect();
    await new Promise<void>((resolve) => {
      if (this.io) this.io.close(() => resolve());
      else resolve();
    });
    if (this.source?.isInitialized) await this.source.destroy();
  }
}
