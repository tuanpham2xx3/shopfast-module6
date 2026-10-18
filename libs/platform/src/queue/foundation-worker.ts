import {
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
  Injectable,
} from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { DataSource } from "typeorm";
import { createDataSource } from "../database/data-source";
import {
  deliverFakeEvent,
  OutboxEvent,
  publishOutboxBatch,
} from "../outbox/outbox";

@Injectable()
export class FoundationWorker implements OnModuleInit, OnApplicationShutdown {
  private source?: DataSource;
  private redis?: Redis;
  private queue?: Queue<OutboxEvent>;
  private worker?: Worker<OutboxEvent>;
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private closing = false;

  async onModuleInit(): Promise<void> {
    if (!process.env.DATABASE_URL || !process.env.REDIS_URL)
      throw new Error("Worker requires DATABASE_URL and REDIS_URL");
    try {
      this.source = await createDataSource(
        process.env.DATABASE_URL,
      ).initialize();
      this.redis = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: null,
        lazyConnect: true,
        connectTimeout: 3000,
        retryStrategy: (times) => (times < 4 ? 1000 : null),
      });
      this.redis.on("error", () =>
        Logger.warn("Redis connection unavailable", "Worker"),
      );
      await this.redis.connect();
      this.queue = new Queue<OutboxEvent>("shopfast-foundation", {
        connection: this.redis,
      });
      this.worker = new Worker<OutboxEvent>(
        "shopfast-foundation",
        async (job) => {
          await deliverFakeEvent(this.source!, job.data);
        },
        { connection: this.redis, concurrency: 2 },
      );
      this.worker.on("error", () =>
        Logger.error("Queue worker error", "Worker"),
      );
      await this.worker.waitUntilReady();
      this.timer = setInterval(() => {
        if (this.running || this.closing) return;
        this.running = this.publish().finally(() => {
          this.running = undefined;
        });
      }, 1000);
      Logger.log("Foundation worker ready", "Worker");
    } catch {
      await this.onApplicationShutdown();
      throw new Error(
        "Worker initialization failed; verify database migrations and Redis connectivity",
      );
    }
  }

  private async publish(): Promise<void> {
    try {
      await publishOutboxBatch(this.source!, async (event) => {
        await this.queue!.add(event.type, event, {
          jobId: event.id,
          attempts: 5,
          backoff: { type: "exponential", delay: 1000 },
          removeOnComplete: { age: 86400, count: 1000 },
          removeOnFail: { count: 1000 },
        });
      });
    } catch {
      Logger.error("Outbox publish failed; retrying next tick", "Worker");
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.closing = true;
    if (this.timer) clearInterval(this.timer);
    await this.running;
    await this.worker?.close();
    await this.queue?.close();
    this.redis?.disconnect();
    if (this.source?.isInitialized) await this.source.destroy();
  }
}
