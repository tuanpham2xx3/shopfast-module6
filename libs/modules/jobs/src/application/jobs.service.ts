import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { DataSource } from "typeorm";
import { OutboxEvent } from "../../../../platform/src/outbox/outbox";
import { AiService } from "../../../ai/src/application/ai.service";
import { GeminiProvider } from "../../../ai/src/adapters/gemini.provider";
import { OrderService } from "../../../orders/src/application/order.service";
import { TicketsService } from "../../../tickets/src/application/tickets.service";
import { renderInvoice } from "../adapters/invoice.renderer";
import { EmailAdapter, JobRow, PermanentJobError } from "../jobs.contracts";
import { JobsRepository } from "../persistence/jobs.repository";
export function businessDate(at: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}
export function retryDelay(attempt: number, random = Math.random) {
  return Math.min(
    60000,
    2000 * 2 ** Math.max(0, attempt - 1) * (0.5 + random()),
  );
}
export class JobsService {
  private aiProvider?: GeminiProvider;
  setAiProvider(provider: GeminiProvider) {
    this.aiProvider = provider;
    this.ai = undefined;
  }
  private readonly repository: JobsRepository;
  private ai?: AiService;
  private handlers = new Map<
    string,
    (payload: Record<string, unknown>) => Promise<unknown>
  >();
  setHandler(
    type: string,
    handler: (payload: Record<string, unknown>) => Promise<unknown>,
  ) {
    this.handlers.set(type, handler);
  }
  constructor(
    readonly source: DataSource,
    readonly email: EmailAdapter,
    private secret: string,
    readonly schema = "public",
    private clock = () => new Date(),
  ) {
    this.repository = new JobsRepository(this.schema);
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema))
      throw new Error("Invalid schema");
    if (secret.length < 32)
      throw new Error("Invoice signing secret must be at least 32 characters");
  }
  t(n: string) {
    return `"${this.schema}".${n}`;
  }
  async enqueue(
    key: string,
    type: string,
    payload: Record<string, unknown>,
    max = 5,
    available = this.clock(),
  ) {
    await this.repository.enqueueJobExecutionsInsert(this.source, [
      key,
      type,
      JSON.stringify(payload),
      max,
      available,
    ]);
  }
  async route(event: OutboxEvent) {
    const id = event.aggregateId;
    if (
      ["order.created", "order.changed", "payment.confirmed"].includes(
        event.type,
      )
    ) {
      const inventory = await this.repository.routeInventoriesSelect(
        this.source,
        [id],
      );
      for (const row of inventory)
        await this.enqueue(
          `partner:${row.product_id}:${row.version}`,
          "inventory.partner-sync",
          { productId: row.product_id },
        );
    }
    if (event.type === "auth.email")
      await this.enqueue(
        event.businessKey,
        "email.verification",
        event.payload,
        3,
      );
    else if (event.type === "order.created") {
      await this.enqueue(`email:order:${id}`, "email.order-confirmation", {
        orderId: id,
      });
    } else if (event.type === "payment.confirmed")
      await this.enqueue(
        `invoice:${id}:v1`,
        "invoice.generate",
        { orderId: id },
        3,
      );
    else if (event.type === "inventory.changed")
      await this.enqueue(
        `partner:${id}:${event.aggregateVersion}`,
        "inventory.partner-sync",
        { productId: id },
      );
    else if (event.type === "ticket.classify")
      await this.enqueue(
        event.businessKey,
        "ticket.classify",
        event.payload,
        3,
      );
    else if (!["order.changed", "catalog.invalidate"].includes(event.type))
      throw new Error("UNSUPPORTED_OUTBOX_EVENT");
  }
  async catchUp() {
    const now = this.clock();
    const orders = await this.repository.catchUpOrdersSelect(this.source, [
      new Date(now.getTime() - 1800000),
    ]);
    for (const row of orders)
      await this.enqueue(
        `reminder:${row.id}:30m`,
        "payment.remind",
        { orderId: row.id },
        3,
      );
    const expired = await this.repository.catchUpOrdersSelect2(this.source, [
      now,
    ]);
    for (const row of expired)
      await this.enqueue(
        `expire:${row.id}`,
        "order.expire",
        { orderId: row.id },
        5,
      );
    const [{ start }] = await this.repository.catchUpOrdersSelect3(
      this.source,
      [],
    );
    if (start) {
      const dates = await this.repository.catchUpLockSelect(this.source, [
        start,
        now,
      ]);
      for (const { day } of dates)
        await this.enqueue(`revenue:${day}`, "revenue.daily", { date: day }, 3);
    }
  }
  async drain(limit = 20, businessKey?: string) {
    for (let i = 0; i < limit; i++) {
      const token = randomUUID();
      const [rows]: [JobRow[], number] =
        await this.repository.drainJobExecutionsUpdate(this.source, [
          token,
          new Date(this.clock().getTime() + 60000),
          this.clock(),
          businessKey ?? null,
        ]);
      if (!rows.length) break;
      const job = rows[0]!;
      const heartbeat = setInterval(() => {
        void this.repository
          .drainJobExecutionsUpdate2(this.source, [
            job.business_key,
            token,
            new Date(this.clock().getTime() + 60000),
          ])
          .catch(() => undefined);
      }, 20000);
      try {
        if (job.attempts > job.max_attempts) throw new Error("ARCHIVE_RETRY");
        const result = await this.execute(job);
        await this.repository.drainJobExecutionsUpdate3(this.source, [
          job.business_key,
          token,
          this.clock(),
          result === "SKIPPED" ? "SKIPPED" : job.business_key,
        ]);
      } catch (error) {
        await this.source.transaction(async (m) => {
          const terminal =
            error instanceof PermanentJobError ||
            job.attempts >= job.max_attempts;
          const result = await this.repository.drainJobExecutionsUpdate4(m, [
            job.business_key,
            token,
            terminal ? "FAILED" : "PENDING",
            new Date(this.clock().getTime() + retryDelay(job.attempts)),
            this.clock(),
          ]);
          if (terminal && result[0]?.length)
            await this.repository.drainFailedJobsInsert(m, [
              randomUUID(),
              job.business_key,
              job.attempts,
            ]);
        });
        if (businessKey) throw new Error("JOB_PROCESSING_FAILED");
      } finally {
        clearInterval(heartbeat);
      }
    }
  }
  private async order(id: unknown) {
    const [o] = await this.repository.orderOrdersSelect(this.source, [id]);
    return o;
  }
  private async execute(j: JobRow) {
    const p = j.payload;
    const handler = this.handlers.get(j.type);
    if (handler) {
      await handler(p);
      return;
    }
    if (j.type === "ticket.classify")
      return (this.ai ??= new AiService(
        new TicketsService(this.source, this.schema),
        this.aiProvider,
      )).classify(String(p.ticketId), Number(p.classificationVersion ?? 1));
    if (j.type === "order.expire") {
      await new OrderService(this.source, this.schema).expireDue(this.clock());
      return;
    }
    if (j.type === "email.verification")
      return this.email.send(j.business_key, p);
    if (j.type === "email.order-confirmation" || j.type === "payment.remind") {
      const o = await this.order(p.orderId);
      if (!o) throw new PermanentJobError("MISSING_ORDER");
      if (
        j.type === "payment.remind" &&
        (o.status !== "PENDING_PAYMENT" ||
          new Date(o.expires_at) <= this.clock())
      )
        return "SKIPPED";
      await this.email.send(j.business_key, {
        template: j.type,
        recipient: o.email,
        orderCode: o.code,
        total: o.total,
        discount: o.discount,
        expiresAt: new Date(o.expires_at).toISOString(),
        items: await this.repository.executeOrderItemsSelect(this.source, [
          o.id,
        ]),
      });
    } else if (j.type === "invoice.generate") {
      const o = await this.order(p.orderId);
      if (
        !o ||
        o.payment_status !== "PAID" ||
        !["CONFIRMED", "PROCESSING", "SHIPPING", "DELIVERED"].includes(o.status)
      )
        return;
      const items = await this.repository.executeOrderItemsSelect2(
        this.source,
        [o.id],
      );
      const content = await renderInvoice(o, items);
      await this.repository.executeInvoicesInsert(this.source, [
        o.id,
        content,
        createHash("sha256").update(content).digest("hex"),
      ]);
    } else if (j.type === "inventory.partner-sync") {
      if (
        process.env.NODE_ENV === "production" &&
        process.env.PARTNER_SYNC_MODE !== "versioned-demo"
      )
        throw new Error("PARTNER_MOCK_DISABLED_IN_PRODUCTION");
      await this.repository.executePartnerInventoryInsert(this.source, [
        p.productId,
      ]);
    } else if (j.type === "revenue.daily") {
      if (typeof p.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.date))
        throw new PermanentJobError("INVALID_DATE");
      const [r] = await this.repository.executeOrdersSelect(this.source, [
        p.date,
      ]);
      await this.repository.executeRevenueReportsInsert(this.source, [
        p.date,
        r.total,
        r.count,
        `business_date,delivered_orders,revenue_vnd\n${p.date},${r.count},${r.total}\n`,
      ]);
      const admins = await this.repository.executeUsersSelect(this.source, []);
      for (const a of admins)
        await this.email.send(`${j.business_key}:${a.id}`, {
          recipient: a.email,
          template: "daily-revenue",
          businessDate: p.date,
          orderCount: r.count,
          total: r.total,
          reportUrl: `/admin/reports/revenue/${p.date}`,
        });
    } else throw new PermanentJobError("UNSUPPORTED_JOB");
  }
  async invoice(id: string, userId: string) {
    const o = await this.order(id);
    if (!o || o.customer_id !== userId) return { status: "UNAVAILABLE" };
    if (
      o.payment_status !== "PAID" ||
      ["CANCELLED", "EXPIRED"].includes(o.status)
    )
      return { status: "UNAVAILABLE" };
    const [invoice] = await this.repository.invoiceInvoicesSelect(this.source, [
      id,
    ]);
    if (!invoice) {
      const [job] = await this.repository.invoiceJobExecutionsSelect(
        this.source,
        [`invoice:${id}:v1`],
      );
      return { status: job?.status === "FAILED" ? "FAILED" : "PENDING" };
    }
    const expires = Math.floor(this.clock().getTime() / 1000) + 300;
    const signature = this.sign(id, userId, expires);
    return {
      status: "READY",
      expiresAt: new Date(expires * 1000).toISOString(),
      downloadUrl: `/orders/${id}/invoice/download?expires=${expires}&signature=${signature}`,
    };
  }
  private sign(id: string, user: string, expiry: number) {
    return createHmac("sha256", this.secret)
      .update(`${id}:${user}:${expiry}`)
      .digest("hex");
  }
  async download(
    id: string,
    userId: string,
    expires: number,
    signature: string,
  ) {
    if (
      !Number.isSafeInteger(expires) ||
      expires < Math.floor(this.clock().getTime() / 1000) ||
      expires > Math.floor(this.clock().getTime() / 1000) + 300 ||
      !/^[a-f0-9]{64}$/.test(signature) ||
      !timingSafeEqual(
        Buffer.from(signature, "hex"),
        Buffer.from(this.sign(id, userId, expires), "hex"),
      )
    )
      return null;
    const [row] = await this.repository.downloadInvoicesSelect(this.source, [
      id,
      userId,
    ]);
    return row?.content ?? null;
  }
  async failedPage(page: number) {
    const items = await this.failed(page);
    const [{ count }] = await this.repository.failedPageFailedJobsSelect(
      this.source,
      [],
    );
    return { items, total: count, page, pageSize: 50 };
  }
  async revenueReport(date: string) {
    const [row] = await this.repository.revenueReportRevenueReportsSelect(
      this.source,
      [date],
    );
    return row;
  }
  async executionCounts() {
    return this.repository.executionCountsJobExecutionsSelect(this.source, []);
  }
  async failed(page = 1) {
    return this.repository.failedFailedJobsSelect(this.source, [
      (page - 1) * 50,
    ]);
  }
  async retry(id: string, actor: string) {
    return this.source.transaction(async (m) => {
      const [f] = await this.repository.retryFailedJobsSelect(m, [id]);
      if (!f) return false;
      await this.repository.retryJobRetryAuditInsert(m, [
        randomUUID(),
        id,
        actor,
      ]);
      await this.repository.retryJobExecutionsUpdate(m, [
        f.business_key,
        this.clock(),
      ]);
      return true;
    });
  }
}
