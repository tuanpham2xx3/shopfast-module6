import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { createHash, randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import { createJobsService } from "../../../libs/modules/jobs/src/composition/jobs.runtime";
import { JobsService } from "../../../libs/modules/jobs/src/application/jobs.service";
import { RetentionService } from "../../../libs/modules/jobs/src/application/retention.service";
import { createDataSource } from "../../../libs/platform/src/database/data-source";
import { domainEvents } from "../../../libs/platform/src/domain-events";
import {
  OutboxEvent,
  deliverFakeEvent,
  publishOutboxBatch,
} from "../../../libs/platform/src/outbox/outbox";
export type OutboxSubscriber = (
  event: OutboxEvent,
  source: DataSource,
) => Promise<void>;
const subscribers: OutboxSubscriber[] = [];
export function registerOutboxSubscriber(subscriber: OutboxSubscriber) {
  subscribers.push(subscriber);
}
export const JOBS_QUEUE = "shopfast-jobs";
@Injectable()
export class FoundationWorker implements OnModuleInit, OnApplicationShutdown {
  private source?: DataSource;
  private redis?: Redis;
  private queue?: Queue;
  private worker?: Worker;
  private jobs?: JobsService;
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private closing = false;
  private lastSchedule = 0;
  private archiveCursor = 0;
  private lastArchive = 0;
  private lastRetention = 0;
  private retentionRunning?: Promise<void>;
  async onModuleInit() {
    if (!process.env.DATABASE_URL || !process.env.REDIS_URL)
      throw new Error("Worker requires DATABASE_URL and REDIS_URL");
    this.source = await createDataSource(
      process.env.DATABASE_URL,
      process.env.DATABASE_SCHEMA,
    ).initialize();
    this.jobs = createJobsService(this.source);
    this.jobs.setHandler("domain-event", (payload) =>
      this.consume(payload as unknown as OutboxEvent),
    );
    this.redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      connectTimeout: 1000,
      retryStrategy: () => 2000,
    });
    this.redis.on("error", () =>
      Logger.warn("Redis unavailable; jobs retained for recovery", "Worker"),
    );
    void this.redis.connect().catch(() => undefined);
    this.queue = new Queue(JOBS_QUEUE, { connection: this.redis });
    this.worker = new Worker(
      JOBS_QUEUE,
      async (job) => {
        if (job.name === "domain-event")
          await this.consume(job.data as OutboxEvent);
        else await this.jobs!.drain(1, job.data.businessKey);
      },
      { connection: this.redis, concurrency: 4 },
    );
    this.worker.on("error", () =>
      Logger.error("Queue consumer unavailable", "Worker"),
    );
    this.timer = setInterval(() => {
      if (this.running || this.closing) return;
      this.running = this.tick()
        .catch(() =>
          Logger.error("Worker tick failed; durable work retained", "Worker"),
        )
        .finally(() => {
          this.running = undefined;
        });
    }, 250);
    Logger.log(
      "BullMQ worker initialized; dependency readiness checked separately",
      "Worker",
    );
  }
  private async consume(event: OutboxEvent) {
    if (
      event.type.startsWith("foundation.") &&
      process.env.NODE_ENV !== "production"
    ) {
      await deliverFakeEvent(this.source!, event, process.env.DATABASE_SCHEMA);
      return;
    }
    if (event.type === "catalog.invalidate" && subscribers.length === 0)
      throw new Error("CACHE_INVALIDATION_HANDLER_UNAVAILABLE");
    await this.jobs!.route(event);
    for (const subscriber of subscribers) await subscriber(event, this.source!);
    if (
      ["order.created", "order.changed", "payment.confirmed"].includes(
        event.type,
      )
    ) {
      const schema = process.env.DATABASE_SCHEMA ?? "public";
      const [row] = await this.source!.query(
        `SELECT to_status,created_at FROM "${schema}".order_status_history WHERE order_id=$1 AND order_version=$2`,
        [event.aggregateId, event.aggregateVersion],
      );
      if (!row) throw new Error("ORDER_EVENT_SNAPSHOT_MISSING");
      const payload = {
        eventId: event.id,
        orderId: event.aggregateId,
        status: row.to_status,
        version: event.aggregateVersion,
        occurredAt: new Date(row.created_at).toISOString(),
      };
      domainEvents.emit("order.status.updated", payload);
      await this.redis!.publish(
        "shopfast:order-events",
        JSON.stringify(payload),
      );
    }
  }
  private async tick() {
    if (!this.retentionRunning && Date.now() - this.lastRetention > 3600000) {
      this.lastRetention = Date.now();
      this.retentionRunning = new RetentionService(
        this.source!,
        process.env.DATABASE_SCHEMA,
      )
        .cleanup()
        .then(() => undefined)
        .catch(() => {
          this.lastRetention = Date.now() - 3540000;
          Logger.warn("Retention failed; retry in one minute", "Worker");
        })
        .finally(() => {
          this.retentionRunning = undefined;
        });
    }
    if (Date.now() - this.lastSchedule > 15000) {
      await this.jobs!.catchUp();
      this.lastSchedule = Date.now();
    }
    if (this.redis?.status !== "ready") return;
    if (Date.now() - this.lastArchive > 15000) {
      await this.archiveFailedEvents();
      this.lastArchive = Date.now();
    }
    await publishOutboxBatch(
      this.source!,
      async (event) => {
        await this.queue!.add("domain-event", event, {
          jobId: event.id,
          attempts: 5,
          backoff: { type: "exponential", delay: 2000 },
          removeOnComplete: { age: 86400 },
          removeOnFail: false,
        });
      },
      process.env.DATABASE_SCHEMA,
    );
    const jobs = await this.source!.query(
      `SELECT business_key,attempts,type FROM ${this.jobs!.t("job_executions")} WHERE status='PENDING' AND available_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY available_at LIMIT 100`,
    );
    for (const job of jobs)
      await this.queue!.add(
        job.type,
        { businessKey: job.business_key },
        {
          jobId: createHash("sha256")
            .update(`${job.business_key}:${job.attempts}`)
            .digest("hex"),
          attempts: 1,
          removeOnComplete: { age: 86400 },
          removeOnFail: false,
        },
      );
  }
  private async archiveFailedEvents() {
    // Reconcile retained BullMQ failures so even an archive database outage is retried.
    const failed = await this.queue!.getFailed(
      this.archiveCursor,
      this.archiveCursor + 99,
    );
    this.archiveCursor = failed.length < 100 ? 0 : this.archiveCursor + 100;
    for (const job of failed) {
      if (job.name !== "domain-event") continue;
      const event = job.data as OutboxEvent;
      await this.source!.transaction(async (m) => {
        const key = `outbox:${event.id}`;
        await m.query(
          `INSERT INTO ${this.jobs!.t("job_executions")}(business_key,type,status,payload,attempts,max_attempts,last_error) VALUES($1,'domain-event','FAILED',$2,5,5,'OUTBOX_PROCESSING_FAILED') ON CONFLICT DO NOTHING`,
          [key, JSON.stringify(event)],
        );
        await m.query(
          `INSERT INTO ${this.jobs!.t("failed_jobs")}(id,business_key,reason,attempt) VALUES($1,$2,'OUTBOX_PROCESSING_FAILED',5) ON CONFLICT(business_key,attempt) DO NOTHING`,
          [randomUUID(), key],
        );
      });
    }
  }
  async onApplicationShutdown() {
    this.closing = true;
    if (this.timer) clearInterval(this.timer);
    await this.running;
    await this.retentionRunning;
    await this.worker?.close();
    await this.queue?.close();
    this.redis?.disconnect();
    if (this.source?.isInitialized) await this.source.destroy();
  }
}
