import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { existsSync } from "node:fs";
import { DataSource } from "typeorm";
import PDFDocument from "pdfkit";
import { OutboxEvent } from "../../platform/src/outbox/outbox";
import { AiService } from "../ai/ai.service";
import { TicketsService } from "../tickets/tickets.service";
import { OrderService } from "../orders/order.service";
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
export function renderInvoice(
  order: { code: string; total: string; discount: string },
  items: { name_snapshot: string; quantity: number; line_total: string }[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 45 });
    const font =
      process.env.PDF_FONT_PATH ??
      (process.platform === "win32"
        ? "C:/Windows/Fonts/arial.ttf"
        : "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf");
    if (existsSync(font)) doc.font(font);
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.fontSize(24).text("ShopFast Invoice");
    doc.fontSize(12).text(order.code);
    for (const item of items)
      doc.text(
        `${item.name_snapshot} | ${item.quantity} | ${item.line_total} VND`,
      );
    doc
      .text(`Discount: ${order.discount} VND`)
      .text(`Total paid: ${order.total} VND`);
    doc.end();
  });
}
export interface EmailAdapter {
  readonly mode: string;
  send(key: string, payload: Record<string, unknown>): Promise<void>;
}
export class HttpEmailAdapter implements EmailAdapter {
  readonly mode = "http-idempotent";
  constructor(
    private url: string,
    private token: string,
    private transport: typeof fetch = fetch,
  ) {
    if (!url.startsWith("https://"))
      throw new Error("Email endpoint requires HTTPS");
  }
  async send(key: string, payload: Record<string, unknown>) {
    const response = await this.transport(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
        "Idempotency-Key": key,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("EMAIL_PROVIDER_UNAVAILABLE");
  }
}
export class DevelopmentEmailAdapter implements EmailAdapter {
  readonly mode = "development-fake";
  constructor(
    private source: DataSource,
    private schema = "public",
  ) {
    if (process.env.NODE_ENV === "production")
      throw new Error("Fake email disabled in production");
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema))
      throw new Error("Invalid schema");
  }
  async send(key: string, _payload: Record<string, unknown>) {
    await this.source.query(
      `INSERT INTO "${this.schema}".fake_deliveries(business_key,channel) VALUES($1,'email') ON CONFLICT DO NOTHING`,
      [key],
    );
  }
}
export class PermanentJobError extends Error {}
type JobRow = {
  business_key: string;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
};
export class JobsService {
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
    await this.source.query(
      `INSERT INTO ${this.t("job_executions")}(business_key,type,status,payload,max_attempts,available_at) VALUES($1,$2,'PENDING',$3,$4,$5) ON CONFLICT DO NOTHING`,
      [key, type, JSON.stringify(payload), max, available],
    );
  }
  async route(event: OutboxEvent) {
    const id = event.aggregateId;
    if (
      ["order.created", "order.changed", "payment.confirmed"].includes(
        event.type,
      )
    ) {
      const inventory = await this.source.query(
        `SELECT i.product_id,i.version FROM ${this.t("inventories")} i JOIN ${this.t("order_items")} oi ON oi.product_id=i.product_id WHERE oi.order_id=$1`,
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
    const orders = await this.source.query(
      `SELECT id,created_at FROM ${this.t("orders")} WHERE status='PENDING_PAYMENT' AND created_at<=$1`,
      [new Date(now.getTime() - 1800000)],
    );
    for (const row of orders)
      await this.enqueue(
        `reminder:${row.id}:30m`,
        "payment.remind",
        { orderId: row.id },
        3,
      );
    const expired = await this.source.query(
      `SELECT id FROM ${this.t("orders")} WHERE status='PENDING_PAYMENT' AND expires_at<=$1`,
      [now],
    );
    for (const row of expired)
      await this.enqueue(
        `expire:${row.id}`,
        "order.expire",
        { orderId: row.id },
        5,
      );
    const [{ start }] = await this.source.query(
      `SELECT (min(created_at) AT TIME ZONE 'Asia/Bangkok')::date::text start FROM ${this.t("orders")}`,
    );
    if (start) {
      const dates = await this.source.query(
        `SELECT d::date::text AS "day" FROM generate_series($1::date,($2::timestamptz AT TIME ZONE 'Asia/Bangkok' - interval '10 minutes')::date-1,interval '1 day') d`,
        [start, now],
      );
      for (const { day } of dates)
        await this.enqueue(`revenue:${day}`, "revenue.daily", { date: day }, 3);
    }
  }
  async drain(limit = 20, businessKey?: string) {
    for (let i = 0; i < limit; i++) {
      const token = randomUUID();
      const [rows]: [JobRow[], number] = await this.source.query(
        `UPDATE ${this.t("job_executions")} SET lease_token=$1,lease_until=$2,attempts=attempts+1,updated_at=$3 WHERE business_key=(SELECT business_key FROM ${this.t("job_executions")} WHERE status='PENDING' AND available_at<=$3 AND (lease_until IS NULL OR lease_until<$3) AND ($4::text IS NULL OR business_key=$4) ORDER BY available_at,business_key LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`,
        [
          token,
          new Date(this.clock().getTime() + 60000),
          this.clock(),
          businessKey ?? null,
        ],
      );
      if (!rows.length) break;
      const job = rows[0]!;
      const heartbeat = setInterval(() => {
        void this.source
          .query(
            `UPDATE ${this.t("job_executions")} SET lease_until=$3 WHERE business_key=$1 AND lease_token=$2`,
            [job.business_key, token, new Date(this.clock().getTime() + 60000)],
          )
          .catch(() => undefined);
      }, 20000);
      try {
        if (job.attempts > job.max_attempts) throw new Error("ARCHIVE_RETRY");
        const result = await this.execute(job);
        await this.source.query(
          `UPDATE ${this.t("job_executions")} SET status='SUCCEEDED',lease_until=NULL,lease_token=NULL,result_ref=$4,updated_at=$3 WHERE business_key=$1 AND lease_token=$2`,
          [
            job.business_key,
            token,
            this.clock(),
            result === "SKIPPED" ? "SKIPPED" : job.business_key,
          ],
        );
      } catch (error) {
        await this.source.transaction(async (m) => {
          const terminal =
            error instanceof PermanentJobError ||
            job.attempts >= job.max_attempts;
          const result = await m.query(
            `UPDATE ${this.t("job_executions")} SET status=$3,last_error='JOB_PROCESSING_FAILED',lease_until=NULL,lease_token=NULL,available_at=$4,updated_at=$5 WHERE business_key=$1 AND lease_token=$2 RETURNING business_key`,
            [
              job.business_key,
              token,
              terminal ? "FAILED" : "PENDING",
              new Date(this.clock().getTime() + retryDelay(job.attempts)),
              this.clock(),
            ],
          );
          if (terminal && result[0]?.length)
            await m.query(
              `INSERT INTO ${this.t("failed_jobs")}(id,business_key,reason,attempt) VALUES($1,$2,'JOB_PROCESSING_FAILED',$3) ON CONFLICT(business_key,attempt) DO NOTHING`,
              [randomUUID(), job.business_key, job.attempts],
            );
        });
        if (businessKey) throw new Error("JOB_PROCESSING_FAILED");
      } finally {
        clearInterval(heartbeat);
      }
    }
  }
  private async order(id: unknown) {
    const [o] = await this.source.query(
      `SELECT o.*,u.email FROM ${this.t("orders")} o JOIN ${this.t("users")} u ON u.id=o.customer_id WHERE o.id=$1`,
      [id],
    );
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
        items: await this.source.query(
          `SELECT name_snapshot AS name,quantity,line_total AS "lineTotal" FROM ${this.t("order_items")} WHERE order_id=$1 ORDER BY id`,
          [o.id],
        ),
      });
    } else if (j.type === "invoice.generate") {
      const o = await this.order(p.orderId);
      if (
        !o ||
        o.payment_status !== "PAID" ||
        !["CONFIRMED", "PROCESSING", "SHIPPING", "DELIVERED"].includes(o.status)
      )
        return;
      const items = await this.source.query(
        `SELECT * FROM ${this.t("order_items")} WHERE order_id=$1 ORDER BY id`,
        [o.id],
      );
      const content = await renderInvoice(o, items);
      await this.source.query(
        `INSERT INTO ${this.t("invoices")}(order_id,content,checksum) SELECT id,$2,$3 FROM ${this.t("orders")} WHERE id=$1 AND payment_status='PAID' AND status IN ('CONFIRMED','PROCESSING','SHIPPING','DELIVERED') ON CONFLICT DO NOTHING`,
        [o.id, content, createHash("sha256").update(content).digest("hex")],
      );
    } else if (j.type === "inventory.partner-sync") {
      if (
        process.env.NODE_ENV === "production" &&
        process.env.PARTNER_SYNC_MODE !== "versioned-demo"
      )
        throw new Error("PARTNER_MOCK_DISABLED_IN_PRODUCTION");
      await this.source.query(
        `INSERT INTO ${this.t("partner_inventory")}(product_id,version,available) SELECT product_id,version,on_hand-reserved FROM ${this.t("inventories")} WHERE product_id=$1 ON CONFLICT(product_id) DO UPDATE SET version=EXCLUDED.version,available=EXCLUDED.available,updated_at=now() WHERE ${this.t("partner_inventory")}.version<EXCLUDED.version`,
        [p.productId],
      );
    } else if (j.type === "revenue.daily") {
      if (typeof p.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.date))
        throw new PermanentJobError("INVALID_DATE");
      const [r] = await this.source.query(
        `SELECT COALESCE(sum(o.total),0)::text total,count(*)::int count FROM ${this.t("orders")} o WHERE o.status='DELIVERED' AND EXISTS(SELECT 1 FROM ${this.t("order_status_history")} h WHERE h.order_id=o.id AND h.to_status='DELIVERED' AND (h.created_at AT TIME ZONE 'Asia/Bangkok')::date=$1::date)`,
        [p.date],
      );
      await this.source.query(
        `INSERT INTO ${this.t("revenue_reports")}(business_date,total,order_count,csv) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [
          p.date,
          r.total,
          r.count,
          `business_date,delivered_orders,revenue_vnd\n${p.date},${r.count},${r.total}\n`,
        ],
      );
      const admins = await this.source.query(
        `SELECT id,email FROM ${this.t("users")} WHERE role='ADMIN' AND status='ACTIVE' AND email_verified_at IS NOT NULL`,
      );
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
    const [invoice] = await this.source.query(
      `SELECT checksum FROM ${this.t("invoices")} WHERE order_id=$1`,
      [id],
    );
    if (!invoice) {
      const [job] = await this.source.query(
        `SELECT status FROM ${this.t("job_executions")} WHERE business_key=$1`,
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
    const [row] = await this.source.query(
      `SELECT i.content FROM ${this.t("invoices")} i JOIN ${this.t("orders")} o ON o.id=i.order_id WHERE i.order_id=$1 AND o.customer_id=$2 AND o.payment_status='PAID' AND o.status NOT IN ('CANCELLED','EXPIRED')`,
      [id, userId],
    );
    return row?.content ?? null;
  }
  async failed(page = 1) {
    return this.source.query(
      `SELECT id,business_key,reason,attempt,created_at FROM ${this.t("failed_jobs")} ORDER BY created_at DESC,id LIMIT 50 OFFSET $1`,
      [(page - 1) * 50],
    );
  }
  async retry(id: string, actor: string) {
    return this.source.transaction(async (m) => {
      const [f] = await m.query(
        `SELECT * FROM ${this.t("failed_jobs")} WHERE id=$1`,
        [id],
      );
      if (!f) return false;
      await m.query(
        `INSERT INTO ${this.t("job_retry_audit")}(id,failed_job_id,actor_id) VALUES($1,$2,$3)`,
        [randomUUID(), id, actor],
      );
      await m.query(
        `UPDATE ${this.t("job_executions")} SET status='PENDING',max_attempts=attempts+max_attempts,available_at=$2,lease_until=NULL WHERE business_key=$1 AND status='FAILED'`,
        [f.business_key, this.clock()],
      );
      return true;
    });
  }
}
