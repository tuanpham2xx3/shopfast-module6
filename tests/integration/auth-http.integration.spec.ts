import { randomUUID } from "node:crypto";
import request from "supertest";
import { DataSource } from "typeorm";
import { createApiApp } from "../../apps/api/src/bootstrap";
import { createDataSource } from "../../libs/platform/src/database/data-source";

describe("auth HTTP vertical slice", () => {
  let source: DataSource;
  let app: Awaited<ReturnType<typeof createApiApp>>;
  const schema = `test_${randomUUID().replace(/-/g, "")}`;
  const origin = "http://localhost:5173";

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL)
      throw new Error("TEST_DATABASE_URL is required");
    source = await createDataSource(
      process.env.TEST_DATABASE_URL,
      schema,
    ).initialize();
    await source.query(`CREATE SCHEMA "${schema}"`);
    await source.runMigrations();
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.DATABASE_SCHEMA = schema;
    process.env.ACCESS_TOKEN_SECRET =
      "http-test-access-secret-at-least-32-characters";
    process.env.WEB_ORIGIN = origin;
    app = await createApiApp({ logger: false });
  });
  afterAll(async () => {
    await app?.close();
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_SCHEMA;
    delete process.env.ACCESS_TOKEN_SECRET;
    if (source?.isInitialized) {
      await source.query(`DROP SCHEMA "${schema}" CASCADE`);
      await source.destroy();
    }
  });

  it("F07 generates and serves Swagger UI and OpenAPI from the test application routes", async () => {
    const server = app.getHttpServer();
    const document = await request(server).get("/api/docs-json").expect(200);
    expect(document.body.openapi).toMatch(/^3\./);
    expect(document.body.info.title).toBe("ShopFast API");
    expect(document.body.paths["/api/v1/auth/login"].post).toBeDefined();
    expect(document.body.paths["/api/v1/products"].get).toBeDefined();
    expect(
      document.body.paths["/api/v1/staff/orders/{id}/status"].patch,
    ).toBeDefined();
    const ui = await request(server).get("/api/docs/").expect(200);
    expect(ui.text).toContain("swagger-ui");
  });

  it("registers, verifies, reads current user, refreshes and logs out", async () => {
    const agent = request.agent(app.getHttpServer());
    const registered = await agent
      .post("/api/v1/auth/register")
      .set("Origin", origin)
      .send({
        email: "web@example.com",
        password: "correct horse battery",
        displayName: "Web User",
      })
      .expect(201);
    expect(registered.body.data).toMatchObject({
      expiresIn: 900,
      verificationRequired: true,
      user: { email: "web@example.com", verified: false },
    });
    expect(JSON.stringify(registered.body)).not.toMatch(
      /refreshToken|123456|passwordHash/,
    );
    expect(registered.headers["set-cookie"]?.[0]).toMatch(
      /HttpOnly.*SameSite=Lax/,
    );

    const [event] = await source.query(
      `SELECT payload FROM "${schema}".outbox_events WHERE type='auth.email' ORDER BY created_at DESC LIMIT 1`,
    );
    const access = registered.body.data.accessToken as string;
    await agent
      .post("/api/v1/auth/verification/confirm")
      .set("Authorization", `Bearer ${access}`)
      .send({ code: event.payload.code })
      .expect(200);
    const me = await agent
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${access}`)
      .expect(200);
    expect(me.body.data).toMatchObject({
      email: "web@example.com",
      verified: true,
      role: "CUSTOMER",
    });

    await agent
      .post("/api/v1/auth/refresh")
      .set("Origin", "https://evil.example")
      .expect(403);
    const refreshed = await agent
      .post("/api/v1/auth/refresh")
      .set("Origin", origin)
      .expect(200);
    expect(refreshed.body.data.accessToken).toEqual(expect.any(String));
    const restored = await agent
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${refreshed.body.data.accessToken}`)
      .expect(200);
    expect(restored.body.data.id).toBe(registered.body.data.user.id);
    await agent.post("/api/v1/auth/logout").set("Origin", origin).expect(204);
    await agent
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${refreshed.body.data.accessToken}`)
      .expect(401);
  });
});
