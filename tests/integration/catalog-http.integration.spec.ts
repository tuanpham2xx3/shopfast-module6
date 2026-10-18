import { randomUUID } from "node:crypto";
import request from "supertest";
import { DataSource } from "typeorm";
import { createApiApp } from "../../apps/api/src/bootstrap";
import { createDataSource } from "../../libs/platform/src/database/data-source";

describe("catalog HTTP roles and vertical flow", () => {
  let source: DataSource;
  let app: Awaited<ReturnType<typeof createApiApp>>;
  const schema = `test_${randomUUID().replace(/-/g, "")}`;
  beforeAll(async () => {
    source = await createDataSource(
      process.env.TEST_DATABASE_URL!,
      schema,
    ).initialize();
    await source.query(`CREATE SCHEMA "${schema}"`);
    await source.runMigrations();
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.DATABASE_SCHEMA = schema;
    process.env.ACCESS_TOKEN_SECRET =
      "catalog-http-test-secret-at-least-32-characters";
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
  it("guards admin mutations and carries product stock into public catalog", async () => {
    const server = app.getHttpServer();
    const registered = await request(server)
      .post("/api/v1/auth/register")
      .send({
        email: "catalog@example.test",
        password: "correct horse battery",
        displayName: "Catalog",
      })
      .expect(201);
    const token = registered.body.data.accessToken;
    const auth = { Authorization: `Bearer ${token}` };
    await request(server)
      .post("/api/v1/admin/categories")
      .send({ name: "Audio", slug: "audio" })
      .expect(401);
    await request(server)
      .post("/api/v1/admin/categories")
      .set(auth)
      .send({ name: "Audio", slug: "audio" })
      .expect(403);
    await source.query(
      `UPDATE "${schema}".users SET email_verified_at=now() WHERE id=$1`,
      [registered.body.data.user.id],
    );
    await request(server)
      .post("/api/v1/admin/categories")
      .set(auth)
      .send({ name: "Audio", slug: "audio" })
      .expect(403);
    await source.query(
      `UPDATE "${schema}".users SET role='ADMIN' WHERE id=$1`,
      [registered.body.data.user.id],
    );
    const category = await request(server)
      .post("/api/v1/admin/categories")
      .set(auth)
      .send({ name: "Audio", slug: "audio" })
      .expect(201);
    const brand = await request(server)
      .post("/api/v1/admin/brands")
      .set(auth)
      .send({ name: "Demo", slug: "demo" })
      .expect(201);
    const product = await request(server)
      .post("/api/v1/admin/products")
      .set(auth)
      .send({
        sku: "DEMO-1",
        slug: "demo-1",
        name: "Demo headphones",
        description: "Synthetic product",
        imageUrl: "https://example.com/demo.jpg",
        categoryId: category.body.data.id,
        brandId: brand.body.data.id,
        price: 200000,
      })
      .expect(201);
    const id = product.body.data.id;
    await request(server)
      .post(`/api/v1/staff/inventory/${id}/adjustments`)
      .set(auth)
      .send({ delta: 3, reason: "Initial stock", expectedVersion: 1 })
      .expect(400);
    const adjustment = await request(server)
      .post(`/api/v1/staff/inventory/${id}/adjustments`)
      .set(auth)
      .set("Idempotency-Key", "http-stock")
      .send({ delta: 3, reason: "Initial stock", expectedVersion: 1 })
      .expect(201);
    expect(adjustment.body.data).toMatchObject({ onHand: 3, version: 2 });
    const detail = await request(server)
      .get(`/api/v1/products/${id}`)
      .expect(200);
    expect(detail.body.data).toMatchObject({ available: 3, price: 200000 });
    await request(server).get("/api/v1/products?pageSize=101").expect(400);
    await request(server)
      .get("/api/v1/products?minPrice=300&maxPrice=100")
      .expect(400);
    await request(server)
      .patch(`/api/v1/admin/products/${id}`)
      .set(auth)
      .send({ expectedVersion: 1, sku: "RENAME" })
      .expect(400);
    await request(server)
      .patch(`/api/v1/admin/categories/${category.body.data.id}`)
      .set(auth)
      .send({ active: false })
      .expect(200);
    await request(server).get(`/api/v1/products/${id}`).expect(404);
  });
});
