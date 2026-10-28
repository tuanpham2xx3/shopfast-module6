import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { DataSource } from "typeorm";
import { createDataSource } from "../../libs/platform/src/database/data-source";
import { CatalogService } from "../../libs/modules/catalog/src/catalog.service";
import { OrderService } from "../../libs/modules/orders/src/order.service";
import {
  CatalogCache,
  catalogListKey,
} from "../../libs/modules/runtime/src/catalog-cache";
import { RedisProtocol } from "./redis-protocol";

describe("catalog cache domain integration (native PostgreSQL, Redis protocol double)", () => {
  let source: DataSource;
  let service: CatalogService;
  let orders: OrderService;
  let protocol: RedisProtocol;
  let product: string;
  let category: string;
  let nextCategory: string;
  let brand: string;
  const schema = `test_${randomUUID().replace(/-/g, "")}`;
  const customer = randomUUID();
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL)
      throw Error("TEST_DATABASE_URL required");
    source = await createDataSource(
      process.env.TEST_DATABASE_URL,
      schema,
    ).initialize();
    await source.query(`CREATE SCHEMA "${schema}"`);
    await source.runMigrations();
    protocol = new RedisProtocol();
    const cache = new CatalogCache(protocol as unknown as Redis);
    service = new CatalogService(source, schema, cache);
    orders = new OrderService(source, schema, cache);
    category = (
      await service.createTaxonomy("categories", {
        name: "First",
        slug: "first",
      })
    ).id;
    nextCategory = (
      await service.createTaxonomy("categories", {
        name: "Second",
        slug: "second",
      })
    ).id;
    brand = (
      await service.createTaxonomy("brands", { name: "Demo", slug: "demo" })
    ).id;
    product = (
      await service.createProduct({
        sku: "CACHE-1",
        slug: "cache-1",
        name: "Cached",
        description: "Demo",
        imageUrl: "https://example.test/image.jpg",
        categoryId: category,
        brandId: brand,
        price: 10,
      })
    ).id;
    await source.query(
      `INSERT INTO "${schema}".users(id,email,password_hash,display_name,role,email_verified_at) VALUES($1,$2,'unused','Demo','CUSTOMER',now())`,
      [customer, `${customer}@example.test`],
    );
  });
  afterAll(async () => {
    if (source?.isInitialized) {
      await source.query(`DROP SCHEMA "${schema}" CASCADE`);
      await source.destroy();
    }
  });
  it("invalidates old/new membership, empty lists, and prices while retaining unrelated lists", async () => {
    const unrelated = randomUUID();
    await service.products({ categoryId: unrelated });
    await service.products({ categoryId: category });
    expect((await service.products({ categoryId: nextCategory })).total).toBe(
      0,
    );
    expect((await service.product(product)).price).toBe(10);
    await service.updateProduct(product, {
      categoryId: nextCategory,
      price: 20,
      expectedVersion: 1,
    });
    expect((await service.products({ categoryId: category })).total).toBe(0);
    expect(
      (await service.products({ categoryId: nextCategory })).items[0].price,
    ).toBe(20);
    expect((await service.product(product)).price).toBe(20);
    expect(
      protocol.data.has(`catalog:${catalogListKey({ categoryId: unrelated })}`),
    ).toBe(true);
  });
  it("writes durable invalidation only inside successful mutation transactions", async () => {
    const count = async () =>
      Number(
        (
          await source.query(
            `SELECT count(*) FROM "${schema}".outbox_events WHERE type='catalog.invalidate'`,
          )
        )[0].count,
      );
    const before = await count();
    await expect(
      service.updateProduct(product, {
        categoryId: randomUUID(),
        expectedVersion: 2,
      }),
    ).rejects.toThrow();
    expect(await count()).toBe(before);
    const events = await source.query(
      `SELECT payload FROM "${schema}".outbox_events WHERE type='catalog.invalidate' AND aggregate_id=$1`,
      [product],
    );
    expect(
      events.some(
        (row: { payload: { tags: string[] } }) =>
          row.payload.tags.includes(`category:${category}`) &&
          row.payload.tags.includes(`category:${nextCategory}`),
      ),
    ).toBe(true);
  });
  it("invalidates inventory after checkout, cancellation, and expiry", async () => {
    await service.adjust(product, customer, "cache-stock", {
      delta: 5,
      expectedVersion: 1,
      reason: "Initial stock",
    });
    expect((await service.product(product)).available).toBe(5);
    const input = {
      items: [{ productId: product, quantity: 2, expectedUnitPrice: 20 }],
      shippingAddress: {
        recipientName: "Demo",
        addressLine: "123 Demo Road",
        phone: "123456789",
        ward: "Demo",
        province: "Demo",
      },
    };
    const order = await orders.checkout(customer, "cache-order-1", input);
    expect((await service.product(product)).available).toBe(3);
    await orders.transition(
      order.id,
      { id: customer, role: "CUSTOMER" },
      "CANCELLED",
      1,
      "cache-cancel-1",
      "Changed plans",
    );
    expect((await service.product(product)).available).toBe(5);
    const expiring = await orders.checkout(customer, "cache-order-2", input);
    await source.query(
      `UPDATE "${schema}".orders SET expires_at=now()-interval '1 minute' WHERE id=$1`,
      [expiring.id],
    );
    expect((await service.product(product)).available).toBe(3);
    await orders.expireDue();
    expect((await service.product(product)).available).toBe(5);
  });
});
