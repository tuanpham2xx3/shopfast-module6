import {
  CallHandler,
  ExecutionContext,
  Global,
  Injectable,
  Module,
  NestInterceptor,
  OnApplicationShutdown,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Request, Response } from "express";
import Redis from "ioredis";
import { DataSource } from "typeorm";
import { catchError, from, mergeMap, throwError } from "rxjs";
import { createDataSource } from "../../../platform/src/database/data-source";
import { CatalogCache } from "./catalog-cache";
import { RateLimitError, RuntimeLimiter } from "./limiter";
import { AuthService } from "../../auth/src/auth.service";

@Injectable()
export class RuntimeServices implements OnApplicationShutdown {
  async authenticatedUser(token: string) {
    await this.get();
    if (!process.env.ACCESS_TOKEN_SECRET) return null;
    try {
      return await new AuthService(this.source!, {
        schema: process.env.DATABASE_SCHEMA,
        accessTokenSecret: process.env.ACCESS_TOKEN_SECRET,
      }).currentUser(token);
    } catch {
      return null;
    }
  }
  private source?: DataSource;
  private redis?: Redis;
  private retryTimer?: NodeJS.Timeout;
  private initializing?: Promise<{
    cache: CatalogCache;
    limiter: RuntimeLimiter;
  }>;
  get() {
    if (!this.initializing)
      this.initializing = this.initialize().catch((error) => {
        this.initializing = undefined;
        throw error;
      });
    return this.initializing;
  }
  private async initialize() {
    if (!process.env.DATABASE_URL) throw new ServiceUnavailableException();
    this.source = await createDataSource(
      process.env.DATABASE_URL,
      process.env.DATABASE_SCHEMA ?? "public",
    ).initialize();
    if (process.env.REDIS_URL) {
      this.redis = new Redis(process.env.REDIS_URL, {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 0,
        connectTimeout: 150,
        commandTimeout: 200,
        retryStrategy: (attempt) => Math.min(attempt * 1000, 10000),
      });
      this.redis.on("error", () => undefined);
      void this.redis.connect().catch(() => undefined);
    }
    const cache = new CatalogCache(this.redis);
    // Replaying recent published events also covers a process restart between
    // queue publication and consumer completion. Ten minutes exceeds data TTL.
    const schema = process.env.DATABASE_SCHEMA ?? "public";
    const pending: { payload: { tags?: unknown } }[] = await this.source.query(
      `SELECT payload FROM "${schema}".outbox_events WHERE type='catalog.invalidate' AND (published_at IS NULL OR created_at>clock_timestamp()-interval '10 minutes')`,
    );
    const tags = pending.flatMap((row) =>
      Array.isArray(row.payload.tags)
        ? row.payload.tags.filter(
            (tag): tag is string => typeof tag === "string",
          )
        : [],
    );
    if (tags.length) await cache.invalidate(tags);
    this.retryTimer = setInterval(() => {
      void cache.retryPending();
    }, 5000);
    this.retryTimer.unref();
    return {
      cache,
      limiter: new RuntimeLimiter(
        this.source,
        this.redis,
        process.env.DATABASE_SCHEMA ?? "public",
      ),
    };
  }
  async onApplicationShutdown() {
    if (this.retryTimer) clearInterval(this.retryTimer);
    this.redis?.disconnect();
    if (this.source?.isInitialized) await this.source.destroy();
  }
}
/** Runs after route guards so authenticated keys come only from validated users. */
@Injectable()
export class RuntimeRateInterceptor implements NestInterceptor {
  constructor(private readonly runtime: RuntimeServices) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: { id: string } }>();
    const response = context.switchToHttp().getResponse<Response>();
    if (/^\/(?:api\/v1\/)?health\/(?:live|ready)\/?$/.test(request.path))
      return next.handle();
    const run = async () => {
      const { limiter } = await this.runtime.get();
      const bearer = request.header?.("authorization");
      if (!request.user && bearer?.startsWith("Bearer "))
        request.user =
          (await this.runtime.authenticatedUser(bearer.slice(7))) ?? undefined;
      await limiter.consume(
        request.user ? "api-user" : "api-public",
        request.user?.id ?? request.ip ?? "unknown",
        request.user ? 120 : 60,
        60000,
      );
      if (limiter.degraded) response.setHeader("X-RateLimit-Degraded", "true");
    };
    return from(run()).pipe(
      mergeMap(() => next.handle()),
      catchError((error: unknown) => {
        if (error instanceof RateLimitError)
          response.setHeader("Retry-After", error.retryAfter);
        else if (error instanceof ServiceUnavailableException) {
          const body = error.getResponse();
          if (typeof body === "object" && "retryAfter" in body)
            response.setHeader("Retry-After", String(body.retryAfter));
        }
        return throwError(() => error);
      }),
    );
  }
}
@Global()
@Module({
  providers: [RuntimeServices, RuntimeRateInterceptor],
  exports: [RuntimeServices, RuntimeRateInterceptor],
})
export class RuntimeModule {}
