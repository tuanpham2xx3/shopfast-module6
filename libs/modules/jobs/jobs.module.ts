import {
  Controller,
  HttpCode,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Res,
  UseGuards,
  Module,
  Injectable,
  OnApplicationShutdown,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Response } from "express";
import Redis from "ioredis";
import { Queue } from "bullmq";
import { DataSource } from "typeorm";
import { createDataSource } from "../../platform/src/database/data-source";
import {
  AccessGuard,
  VerifiedGuard,
  RolesGuard,
  Roles,
  AuthenticatedRequest,
} from "../auth/auth.guards";
import { AuthModule } from "../auth/auth.module";
import { ResendEmailAdapter } from "./resend-email";
import {
  DevelopmentEmailAdapter,
  HttpEmailAdapter,
  JobsService,
} from "./jobs.service";
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
  return new JobsService(source, email, secret, schema);
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
@Controller("orders")
@UseGuards(AccessGuard, VerifiedGuard, RolesGuard)
@Roles("CUSTOMER")
class InvoiceController {
  constructor(private runtime: JobsRuntime) {}
  @Get(":id/invoice") async invoice(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() r: AuthenticatedRequest,
  ) {
    return (await this.runtime.get()).invoice(id, r.user!.id);
  }
  @Get(":id/invoice/download") async download(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() r: AuthenticatedRequest,
    @Query("expires") expires: string,
    @Query("signature") signature: string,
    @Res() res: Response,
  ) {
    const content = await (
      await this.runtime.get()
    ).download(id, r.user!.id, Number(expires), signature ?? "");
    if (!content) throw new NotFoundException();
    res
      .set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="invoice-${id}.pdf"`,
        "Cache-Control": "private, no-store",
      })
      .send(content);
  }
}
@Controller("admin")
@UseGuards(AccessGuard, VerifiedGuard, RolesGuard)
@Roles("ADMIN")
class JobsAdminController {
  constructor(private runtime: JobsRuntime) {}
  @Get("failed-jobs") async failed(@Query("page") page?: string) {
    const current = Math.max(
      1,
      Math.min(100000, Math.floor(Number(page) || 1)),
    );
    const service = await this.runtime.get();
    const items = await service.failed(current);
    const [{ count }] = await service.source.query(
      `SELECT count(*)::int count FROM ${service.t("failed_jobs")}`,
    );
    return { items, total: count, page: current, pageSize: 50 };
  }
  @Post("failed-jobs/:id/retry") @HttpCode(202) async retry(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() r: AuthenticatedRequest,
  ) {
    if (!(await (await this.runtime.get()).retry(id, r.user!.id)))
      throw new NotFoundException();
    return { accepted: true };
  }
  @Get("reports/revenue/:date") async report(
    @Param("date") date: string,
    @Res() res: Response,
  ) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new NotFoundException();
    const service = await this.runtime.get();
    const [row] = await service.source.query(
      `SELECT csv FROM ${service.t("revenue_reports")} WHERE business_date=$1`,
      [date],
    );
    if (!row) throw new NotFoundException();
    res
      .type("text/csv")
      .set("Content-Disposition", `attachment; filename="revenue-${date}.csv"`)
      .send(row.csv);
  }
  @Get("queues") async queues() {
    const service = await this.runtime.get();
    const rows = await service.source.query(
      `SELECT status,count(*)::int count FROM ${service.t("job_executions")} GROUP BY status`,
    );
    return {
      backend: "bullmq-with-postgresql-execution-leases",
      emailMode: service.email.mode,
      partnerMode: "development-mock-versioned",
      checkedAt: new Date().toISOString(),
      redisQueue: await queueSnapshot(),
      durableJobs: rows,
    };
  }
}
@Module({
  imports: [AuthModule],
  controllers: [InvoiceController, JobsAdminController],
  providers: [JobsRuntime],
  exports: [JobsRuntime],
})
export class JobsModule {}

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
