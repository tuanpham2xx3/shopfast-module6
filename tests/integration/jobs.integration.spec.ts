import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import { Jobs1780000500000 } from "../../database/migrations/1780000500000-jobs";
import { DevelopmentEmailAdapter } from "../../libs/modules/jobs/src/adapters/email.adapters";
import { JobsService } from "../../libs/modules/jobs/src/application/jobs.service";
import { createDataSource } from "../../libs/platform/src/database/data-source";
describe("durable jobs, invoice authorization and crash recovery", () => {
  let source: DataSource;
  let service: JobsService;
  const schema = `test_${randomUUID().replace(/-/g, "")}`;
  const user = randomUUID();
  const order = randomUUID();
  let now = new Date("2026-10-18T01:00:00Z");
  beforeAll(async () => {
    source = createDataSource(process.env.TEST_DATABASE_URL!, schema);
    if (
      !source.options.migrations ||
      !(source.options.migrations as unknown[]).includes(Jobs1780000500000)
    )
      source.setOptions({
        migrations: [
          ...(source.options.migrations as Function[]),
          Jobs1780000500000,
        ],
      });
    await source.initialize();
    await source.query(`CREATE SCHEMA "${schema}"`);
    await source.runMigrations();
    service = new JobsService(
      source,
      new DevelopmentEmailAdapter(source, schema),
      "x".repeat(40),
      schema,
      () => now,
    );
    await source.query(
      `INSERT INTO "${schema}".users(id,email,password_hash,display_name,role,email_verified_at) VALUES($1,'jobs@example.test','unused','Jobs','CUSTOMER',now())`,
      [user],
    );
    await source.query(
      `INSERT INTO "${schema}".orders(id,code,customer_id,status,payment_status,subtotal,discount,total,address_snapshot,expires_at) VALUES($1,'JOBS-1',$2,'CONFIRMED','PAID',1200,0,1200,'{}',$3)`,
      [order, user, now],
    );
  });
  afterAll(async () => {
    if (source?.isInitialized) {
      await source.query(`DROP SCHEMA "${schema}" CASCADE`);
      await source.destroy();
    }
  });
  it("deduplicates paid invoices and enforces ownership, signature, expiry and refunds", async () => {
    await service.enqueue(
      `invoice:${order}:v1`,
      "invoice.generate",
      { orderId: order },
      3,
    );
    await Promise.all([service.drain(), service.drain()]);
    const result = await service.invoice(order, user);
    expect(result.status).toBe("READY");
    expect((await service.invoice(order, randomUUID())).status).toBe(
      "UNAVAILABLE",
    );
    const url = new URL(result.downloadUrl!, "http://local");
    const expires = Number(url.searchParams.get("expires"));
    const signature = url.searchParams.get("signature")!;
    expect(
      (await service.download(order, user, expires, signature))
        .subarray(0, 5)
        .toString(),
    ).toBe("%PDF-");
    expect(
      await service.download(order, randomUUID(), expires, signature),
    ).toBeNull();
    expect(
      await service.download(order, user, expires, "0".repeat(64)),
    ).toBeNull();
    now = new Date(now.getTime() + 301000);
    expect(await service.download(order, user, expires, signature)).toBeNull();
    const [{ count }] = await source.query(
      `SELECT count(*)::int count FROM "${schema}".invoices`,
    );
    expect(count).toBe(1);
  });
  it("recovers expired leases without duplicate email and skips reminders after payment", async () => {
    await service.enqueue("email:crash", "email.verification", {
      recipient: "fake@example.test",
    });
    await service.email.send("email:crash", {});
    await source.query(
      `UPDATE "${schema}".job_executions SET lease_until=$1,lease_token=$2 WHERE business_key='email:crash'`,
      [new Date(now.getTime() - 1), randomUUID()],
    );
    await service.enqueue(
      `reminder:${order}:30m`,
      "payment.remind",
      { orderId: order },
      3,
    );
    await service.drain();
    const [{ count }] = await source.query(
      `SELECT count(*)::int count FROM "${schema}".fake_deliveries`,
    );
    expect(count).toBe(1);
  });
  it("archives terminal failures and keeps audit history on admin retry", async () => {
    await service.enqueue("bad-job", "invalid", {}, 1);
    await service.drain();
    const [failed] = await service.failed();
    expect(failed.business_key).toBe("bad-job");
    expect(await service.retry(failed.id, user)).toBe(true);
    await service.drain();
    expect((await service.failed()).length).toBe(2);
    const [{ count }] = await source.query(
      `SELECT count(*)::int count FROM "${schema}".job_retry_audit`,
    );
    expect(count).toBe(1);
  });
  it("JOB-02 persists retry backoff before retrying and dead-letters exhausted jobs with a reason", async () => {
    let attempts = 0;
    service.setHandler("fixture.transient", async () => {
      if (++attempts === 1) throw Error("Synthetic transient failure");
    });
    await service.enqueue("backoff-fixture", "fixture.transient", {}, 3);
    const start = now.getTime();
    await expect(service.drain(1, "backoff-fixture")).rejects.toThrow(
      "JOB_PROCESSING_FAILED",
    );
    const [pending] = await source.query(
      `SELECT status,attempts,available_at,last_error FROM "${schema}".job_executions WHERE business_key='backoff-fixture'`,
    );
    expect(pending.status).toBe("PENDING");
    expect(pending.attempts).toBe(1);
    expect(pending.last_error).toBeTruthy();
    expect(
      new Date(pending.available_at).getTime() - start,
    ).toBeGreaterThanOrEqual(1000);
    expect(
      new Date(pending.available_at).getTime() - start,
    ).toBeLessThanOrEqual(3000);
    await service.drain(1, "backoff-fixture");
    expect(attempts).toBe(1);
    now = new Date(new Date(pending.available_at).getTime() + 1);
    await service.drain(1, "backoff-fixture");
    expect(attempts).toBe(2);
    expect(
      (
        await source.query(
          `SELECT status FROM "${schema}".job_executions WHERE business_key='backoff-fixture'`,
        )
      )[0].status,
    ).toBe("SUCCEEDED");
    service.setHandler("fixture.permanent", async () => {
      throw Error("Synthetic repeated failure");
    });
    await service.enqueue("exhausted-fixture", "fixture.permanent", {}, 2);
    await expect(service.drain(1, "exhausted-fixture")).rejects.toThrow();
    const [retry] = await source.query(
      `SELECT available_at FROM "${schema}".job_executions WHERE business_key='exhausted-fixture'`,
    );
    now = new Date(new Date(retry.available_at).getTime() + 1);
    await expect(service.drain(1, "exhausted-fixture")).rejects.toThrow();
    const [terminal] = await source.query(
      `SELECT status,attempts,last_error FROM "${schema}".job_executions WHERE business_key='exhausted-fixture'`,
    );
    expect(terminal).toMatchObject({
      status: "FAILED",
      attempts: 2,
      last_error: "JOB_PROCESSING_FAILED",
    });
    const [dead] = await source.query(
      `SELECT reason,attempt FROM "${schema}".failed_jobs WHERE business_key='exhausted-fixture'`,
    );
    expect(dead).toMatchObject({ reason: "JOB_PROCESSING_FAILED", attempt: 2 });
  });
  it("JOB-05 schedules reminders at thirty minutes and skips an order paid before execution", async () => {
    const unpaid = randomUUID(),
      paid = randomUUID(),
      start = now.getTime();
    for (const id of [unpaid, paid])
      await source.query(
        `INSERT INTO "${schema}".orders(id,code,customer_id,status,payment_status,subtotal,discount,total,address_snapshot,expires_at,created_at) VALUES($1,$2,$3,'PENDING_PAYMENT','UNPAID',100,0,100,'{}',$4,$5)`,
        [id, id, user, new Date(start + 3600000), new Date(start)],
      );
    now = new Date(start + 1800000 - 1);
    await service.catchUp();
    expect(
      (
        await source.query(
          `SELECT count(*)::int count FROM "${schema}".job_executions WHERE business_key=ANY($1::text[])`,
          [[`reminder:${unpaid}:30m`, `reminder:${paid}:30m`]],
        )
      )[0].count,
    ).toBe(0);
    now = new Date(start + 1800000);
    await service.catchUp();
    await service.catchUp();
    expect(
      (
        await source.query(
          `SELECT count(*)::int count FROM "${schema}".job_executions WHERE business_key=ANY($1::text[])`,
          [[`reminder:${unpaid}:30m`, `reminder:${paid}:30m`]],
        )
      )[0].count,
    ).toBe(2);
    await source.query(
      `UPDATE "${schema}".orders SET status='CONFIRMED',payment_status='PAID' WHERE id=$1`,
      [paid],
    );
    await service.drain(1, `reminder:${unpaid}:30m`);
    await service.drain(1, `reminder:${paid}:30m`);
    const [delivery] = await source.query(
      `SELECT count(*)::int count FROM "${schema}".fake_deliveries WHERE business_key=ANY($1::text[])`,
      [[`reminder:${unpaid}:30m`, `reminder:${paid}:30m`]],
    );
    expect(delivery.count).toBe(1);
    expect(
      (
        await source.query(
          `SELECT result_ref FROM "${schema}".job_executions WHERE business_key=$1`,
          [`reminder:${paid}:30m`],
        )
      )[0].result_ref,
    ).toBe("SKIPPED");
  });
  it("catches up Bangkok daily reports and expires through the domain service", async () => {
    const due = randomUUID();
    await source.query(
      `INSERT INTO "${schema}".orders(id,code,customer_id,status,payment_status,subtotal,discount,total,address_snapshot,expires_at,created_at) VALUES($1,'JOBS-DUE',$2,'PENDING_PAYMENT','UNPAID',0,0,0,'{}',$3,$4)`,
      [
        due,
        user,
        new Date(now.getTime() - 1),
        new Date(now.getTime() - 3600001),
      ],
    );
    await service.catchUp();
    await service.drain();
    const [expired] = await source.query(
      `SELECT status FROM "${schema}".orders WHERE id=$1`,
      [due],
    );
    expect(expired.status).toBe("EXPIRED");
    await source.query(
      `UPDATE "${schema}".orders SET status='DELIVERED' WHERE id=$1`,
      [order],
    );
    await source.query(
      `INSERT INTO "${schema}".order_status_history(id,order_id,to_status,source,order_version,created_at) VALUES($1,$2,'DELIVERED','TEST',2,'2026-10-17T18:00:00Z')`,
      [randomUUID(), order],
    );
    now = new Date("2026-10-18T17:11:00Z");
    await service.catchUp();
    await service.drain();
    const [report] = await source.query(
      `SELECT total::text,order_count,csv FROM "${schema}".revenue_reports WHERE business_date='2026-10-18'`,
    );
    expect(report.total).toBe("1200");
    expect(report.order_count).toBe(1);
    expect(report.csv).toContain("2026-10-18,1,1200");
  });
  it("never overwrites a newer partner inventory snapshot with older data", async () => {
    const product = randomUUID(),
      category = randomUUID(),
      brand = randomUUID();
    await source.query(
      `INSERT INTO "${schema}".categories(id,name,slug) VALUES($1,'Test','test')`,
      [category],
    );
    await source.query(
      `INSERT INTO "${schema}".brands(id,name,slug) VALUES($1,'Test','test')`,
      [brand],
    );
    await source.query(
      `INSERT INTO "${schema}".products(id,sku,slug,name,description,image_url,category_id,brand_id,price) VALUES($1,'JOBS-SKU','jobs-sku','Test','','',$2,$3,100)`,
      [product, category, brand],
    );
    await source.query(
      `INSERT INTO "${schema}".inventories(product_id,on_hand,reserved,version) VALUES($1,10,2,5)`,
      [product],
    );
    await service.enqueue(`partner:${product}:5`, "inventory.partner-sync", {
      productId: product,
    });
    await service.drain();
    await source.query(
      `UPDATE "${schema}".inventories SET version=4,on_hand=8 WHERE product_id=$1`,
      [product],
    );
    await service.enqueue(`partner:${product}:4`, "inventory.partner-sync", {
      productId: product,
    });
    await service.drain();
    const [partner] = await source.query(
      `SELECT version,available FROM "${schema}".partner_inventory WHERE product_id=$1`,
      [product],
    );
    expect(partner).toEqual({ version: 5, available: 8 });
  });
});
