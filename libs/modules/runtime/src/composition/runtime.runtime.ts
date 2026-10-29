import {
  Injectable,
  OnApplicationShutdown,
  ServiceUnavailableException,
} from "@nestjs/common";
import Redis from "ioredis";
import { DataSource } from "typeorm";
import { createDataSource } from "../../../../platform/src/database/data-source";
import { AuthService } from "../../../auth/src/auth.service";
import { CatalogCache } from "../catalog-cache";
import { RuntimeLimiter } from "../limiter";

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
