import {
  Injectable,
  OnApplicationShutdown,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Queue } from "bullmq";
import Redis from "ioredis";
import { DataSource } from "typeorm";
import { createDataSource } from "../../../../platform/src/database/data-source";
import {
  DevelopmentEmailAdapter,
  HttpEmailAdapter,
} from "../adapters/email.adapters";
import { JobsService } from "../application/jobs.service";
import { ResendEmailAdapter } from "../adapters/resend-email";
import { GoogleGeminiProvider } from "../../../ai/src/adapters/gemini.provider";

export function createJobsService(
  source: DataSource,
  schema = process.env.DATABASE_SCHEMA ?? "public",
) {
  const secret =
    process.env.INVOICE_SIGNING_SECRET || process.env.ACCESS_TOKEN_SECRET || "";
  const email =
    process.env.EMAIL_PROVIDER === "resend" &&
    process.env.RESEND_API_KEY &&
    process.env.EMAIL_FROM
      ? new ResendEmailAdapter(
          source,
          schema,
          process.env.RESEND_API_KEY,
          process.env.EMAIL_FROM,
          process.env.WEB_ORIGIN!,
        )
      : process.env.EMAIL_PROVIDER_URL && process.env.EMAIL_PROVIDER_TOKEN
        ? new HttpEmailAdapter(
            process.env.EMAIL_PROVIDER_URL,
            process.env.EMAIL_PROVIDER_TOKEN,
          )
        : new DevelopmentEmailAdapter(source, schema);
  const service = new JobsService(source, email, secret, schema);
  service.setAiProvider(new GoogleGeminiProvider());
  return service;
}

@Injectable()
export class JobsRuntime implements OnApplicationShutdown {
  private source?: DataSource;
  private pending?: Promise<JobsService>;
  get() {
    return (this.pending ??= this.init().catch((e) => {
      this.pending = undefined;
      throw e;
    }));
  }
  private async init() {
    if (!process.env.DATABASE_URL) throw new ServiceUnavailableException();
    this.source = await createDataSource(
      process.env.DATABASE_URL,
      process.env.DATABASE_SCHEMA,
    ).initialize();
    return createJobsService(this.source);
  }
  async onApplicationShutdown() {
    if (this.source?.isInitialized) await this.source.destroy();
  }
}

export async function queueSnapshot() {
  const checkedAt = new Date().toISOString();
  if (!process.env.REDIS_URL)
    return { status: "unavailable", counts: null, checkedAt };
  const redis = new Redis(process.env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 1000,
    retryStrategy: () => null,
    enableOfflineQueue: false,
  });
  redis.on("error", () => undefined);
  let queue: Queue | undefined;
  try {
    await redis.connect();
    queue = new Queue("shopfast-jobs", { connection: redis });
    const counts = await queue.getJobCounts(
      "waiting",
      "active",
      "completed",
      "failed",
      "delayed",
    );
    return { status: "ok", counts, checkedAt: new Date().toISOString() };
  } catch {
    return { status: "unavailable", counts: null, checkedAt };
  } finally {
    await queue?.close();
    redis.disconnect();
  }
}
