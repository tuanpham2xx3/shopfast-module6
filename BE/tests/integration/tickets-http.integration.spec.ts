import { randomUUID } from "node:crypto";
import request from "supertest";
import { DataSource } from "typeorm";
import { createApiApp } from "../../api/src/bootstrap";
import { createDataSource } from "../../platform/src/database/data-source";

describe("customer ticket creation HTTP contract", () => {
  let source: DataSource;
  let app: Awaited<ReturnType<typeof createApiApp>>;
  let access: string;
  const schema = `test_${randomUUID().replace(/-/g, "")}`;
  const ownOrder = randomUUID();
  const foreignOrder = randomUUID();
  const fields = [
    "DATABASE_URL",
    "DATABASE_SCHEMA",
    "ACCESS_TOKEN_SECRET",
    "WEB_ORIGIN",
    "REDIS_URL",
  ] as const;
  const previous = Object.fromEntries(
    fields.map((key) => [key, process.env[key]]),
  );
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL)
      throw Error("TEST_DATABASE_URL is required");
    source = await createDataSource(
      process.env.TEST_DATABASE_URL,
      schema,
    ).initialize();
    await source.query(`CREATE SCHEMA "${schema}"`);
    await source.runMigrations();
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.DATABASE_SCHEMA = schema;
    process.env.ACCESS_TOKEN_SECRET =
      "ticket-http-only-test-secret-at-least-32-characters";
    process.env.WEB_ORIGIN = "http://localhost:5173";
    delete process.env.REDIS_URL;
    app = await createApiApp({ logger: false });
    const server = app.getHttpServer();
    const registered = await request(server)
      .post("/api/v1/auth/register")
      .send({
        email: "ticket-http@example.test",
        password: "TicketOnlySyntheticPassword!",
        displayName: "Synthetic customer",
      })
      .expect(201);
    access = registered.body.data.accessToken;
    const customerId = registered.body.data.user.id;
    const [event] = await source.query(
      `SELECT payload FROM "${schema}".outbox_events WHERE aggregate_id=$1 AND type='auth.email'`,
      [customerId],
    );
    await request(server)
      .post("/api/v1/auth/verification/confirm")
      .set("Authorization", `Bearer ${access}`)
      .send({ code: event.payload.code })
      .expect(200);
    const other = randomUUID();
    await source.query(
      `INSERT INTO "${schema}".users(id,email,password_hash,display_name,role,email_verified_at) VALUES($1,'other-ticket@example.test','not-a-login','Synthetic other','CUSTOMER',now())`,
      [other],
    );
    for (const [id, code, owner] of [
      [ownOrder, "SF-TICKET-OWN", customerId],
      [foreignOrder, "SF-TICKET-OTHER", other],
    ])
      await source.query(
        `INSERT INTO "${schema}".orders(id,code,customer_id,status,payment_status,subtotal,discount,total,address_snapshot,expires_at) VALUES($1,$2,$3,'DELIVERED','PAID',100,0,100,'{}',now()+interval '1 hour')`,
        [id, code, owner],
      );
  });
  afterAll(async () => {
    await app?.close();
    for (const key of fields) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (source?.isInitialized) {
      await source.query(`DROP SCHEMA "${schema}" CASCADE`);
      await source.destroy();
    }
  });
  const body = {
    subject: "Kiểm tra giao hàng",
    body: "Nhờ kiểm tra đơn hàng giúp tôi.",
  };
  it("returns 401 before any mutation when the customer session is absent", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/tickets")
      .send(body)
      .expect(401);
    const [r] = await source.query(
      `SELECT count(*)::int n FROM "${schema}".tickets`,
    );
    expect(r.n).toBe(0);
  });
  it("lists only owned order codes and accepts their UUID rather than an order code", async () => {
    const orders = await request(app.getHttpServer())
      .get("/api/v1/orders?page=1&pageSize=100")
      .set("Authorization", `Bearer ${access}`)
      .expect(200);
    expect(orders.body.data.items.map((o: { id: string }) => o.id)).toEqual([
      ownOrder,
    ]);
    await request(app.getHttpServer())
      .post("/api/v1/tickets")
      .set("Authorization", `Bearer ${access}`)
      .send({ ...body, orderId: "SF-TICKET-OWN" })
      .expect(400);
    const created = await request(app.getHttpServer())
      .post("/api/v1/tickets")
      .set("Authorization", `Bearer ${access}`)
      .send({ ...body, orderId: ownOrder })
      .expect(201);
    expect(created.body.data.orderId).toBe(ownOrder);
  });
  it("accepts an omitted optional order and still rejects a foreign or blank UUID", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/v1/tickets")
      .set("Authorization", `Bearer ${access}`)
      .send(body)
      .expect(201);
    expect(created.body.data.orderId).toBeNull();
    await request(app.getHttpServer())
      .post("/api/v1/tickets")
      .set("Authorization", `Bearer ${access}`)
      .send({ ...body, orderId: "" })
      .expect(400);
    await request(app.getHttpServer())
      .post("/api/v1/tickets")
      .set("Authorization", `Bearer ${access}`)
      .send({ ...body, orderId: foreignOrder })
      .expect(404);
    const [r] = await source.query(
      `SELECT count(*)::int n FROM "${schema}".tickets`,
    );
    expect(r.n).toBe(2);
  });
});
