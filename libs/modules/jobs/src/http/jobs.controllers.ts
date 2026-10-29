import {
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import {
  AccessGuard,
  AuthenticatedRequest,
  Roles,
  RolesGuard,
  VerifiedGuard,
} from "../../../auth/src/auth.guards";
import { JobsRuntime, queueSnapshot } from "../composition/jobs.runtime";

@Controller("orders")
@UseGuards(AccessGuard, VerifiedGuard, RolesGuard)
@Roles("CUSTOMER")
export class InvoiceController {
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
export class JobsAdminController {
  constructor(private runtime: JobsRuntime) {}
  @Get("failed-jobs") async failed(@Query("page") page?: string) {
    const current = Math.max(
      1,
      Math.min(100000, Math.floor(Number(page) || 1)),
    );
    const service = await this.runtime.get();
    return service.failedPage(current);
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
    const row = await service.revenueReport(date);
    if (!row) throw new NotFoundException();
    res
      .type("text/csv")
      .set("Content-Disposition", `attachment; filename="revenue-${date}.csv"`)
      .send(row.csv);
  }
  @Get("queues") async queues() {
    const service = await this.runtime.get();
    const rows = await service.executionCounts();
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
