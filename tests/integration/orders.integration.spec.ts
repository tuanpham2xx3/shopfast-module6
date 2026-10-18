import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import { createDataSource } from "../../libs/platform/src/database/data-source";
import { CatalogService } from "../../libs/modules/catalog/catalog.service";
import { OrderService } from "../../libs/modules/orders/order.service";

describe("order transaction invariants", () => {
  let source: DataSource;
  let service: OrderService;
  let catalog: CatalogService;
  const schema = `test_${randomUUID().replace(/-/g, "")}`;
  const customer = randomUUID();
  const staff = randomUUID();
  let productId: string;
  beforeAll(async () => {
    source = await createDataSource(
      process.env.TEST_DATABASE_URL!,
      schema,
    ).initialize();
    await source.query(`CREATE SCHEMA "${schema}"`);
    await source.runMigrations();
    catalog = new CatalogService(source, schema);
    service = new OrderService(source, schema);
    for (const id of [customer, staff])
      await source.query(
        `INSERT INTO "${schema}".users(id,email,password_hash,display_name,role,email_verified_at) VALUES($1,$2,'unused','Test','CUSTOMER',now())`,
        [id, `${id}@example.test`],
      );
    const category = await catalog.createTaxonomy("categories", {
      name: "Audio",
      slug: "audio",
    });
    const brand = await catalog.createTaxonomy("brands", {
      name: "Demo",
      slug: "demo",
    });
    productId = (
      await catalog.createProduct({
        sku: "ORDER-1",
        slug: "order-1",
        name: "Order product",
        description: "Demo",
        imageUrl: "https://example.test/demo.jpg",
        categoryId: category.id,
        brandId: brand.id,
        price: 100000,
      })
    ).id;
    await catalog.adjust(productId, staff, "order-initial", {
      delta: 1,
      reason: "Initial one unit",
      expectedVersion: 1,
    });
  });
  afterAll(async () => {
    if (source?.isInitialized) {
      await source.query(`DROP SCHEMA "${schema}" CASCADE`);
      await source.destroy();
    }
  });
  const input = () => ({
    items: [{ productId, quantity: 1, expectedUnitPrice: 100000 }],
    shippingAddress: {
      recipientName: "Demo",
      addressLine: "123 Example Street",
      ward: "Demo Ward",
      province: "Demo City",
      phone: "0901234567",
    },
  });
  it("allows exactly one of twenty buyers to reserve the last unit", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) =>
        service.checkout(customer, `contention-${i}`, input()),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [{ reserved, on_hand }] = await source.query(
      `SELECT * FROM "${schema}".inventories WHERE product_id=$1`,
      [productId],
    );
    expect(reserved).toBe(1);
    expect(on_hand).toBe(1);
    const [{ count }] = await source.query(
      `SELECT count(*)::int count FROM "${schema}".orders`,
    );
    expect(count).toBe(1);
  });
  it("replays checkout and follows mock payment through delivery exactly once", async () => {
    await catalog.adjust(productId, staff, "order-extra", {
      delta: 5,
      reason: "Extra delivery units",
      expectedVersion: 3,
    });
    await service.addCart(customer, productId, 2);
    const body = input();
    const order = await service.checkout(customer, "purchase-1", body);
    expect(await service.checkout(customer, "purchase-1", body)).toEqual(order);
    await expect(
      service.checkout(customer, "purchase-1", {
        ...body,
        items: [{ ...body.items[0]!, quantity: 2 }],
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect((await service.cart(customer)).items[0].quantity).toBe(1);
    await expect(service.detail(order.id, staff)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const paid = await service.transition(
      order.id,
      { id: customer, role: "CUSTOMER" },
      "CONFIRMED",
      1,
      "payment-1",
    );
    expect(paid.paymentStatus).toBe("PAID");
    await expect(
      service.transition(
        order.id,
        { id: customer, role: "CUSTOMER" },
        "SHIPPING",
        2,
        "illegal-shipping",
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await service.transition(
      order.id,
      { id: staff, role: "WAREHOUSE" },
      "PROCESSING",
      2,
      "processing-1",
    );
    const shipped = await service.transition(
      order.id,
      { id: staff, role: "WAREHOUSE" },
      "SHIPPING",
      3,
      "shipping-1",
    );
    expect(
      await service.transition(
        order.id,
        { id: staff, role: "WAREHOUSE" },
        "SHIPPING",
        3,
        "shipping-1",
      ),
    ).toEqual(shipped);
    const delivered = await service.transition(
      order.id,
      { id: staff, role: "WAREHOUSE" },
      "DELIVERED",
      4,
      "delivered-1",
    );
    expect(delivered.status).toBe("DELIVERED");
    const [{ on_hand, reserved }] = await source.query(
      `SELECT * FROM "${schema}".inventories WHERE product_id=$1`,
      [productId],
    );
    expect(on_hand).toBe(5);
    expect(reserved).toBe(1);
  });
  it("rejects changed prices and rolls back an entire multi-product request", async () => {
    await expect(
      service.checkout(customer, "wrong-price", {
        ...input(),
        items: [{ productId, quantity: 1, expectedUnitPrice: 1 }],
      }),
    ).rejects.toMatchObject({ code: "PRICE_CHANGED" });
    await expect(
      service.checkout(customer, "missing-product", {
        ...input(),
        items: [
          ...input().items,
          { productId: randomUUID(), quantity: 1, expectedUnitPrice: 10 },
        ],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const [{ reserved }] = await source.query(
      `SELECT * FROM "${schema}".inventories WHERE product_id=$1`,
      [productId],
    );
    expect(reserved).toBe(1);
  });

  it("releases reservations and refunds mock payment on cancellation", async () => {
    const order = await service.checkout(customer, "cancel-purchase", input());
    await service.transition(
      order.id,
      { id: customer, role: "CUSTOMER" },
      "CONFIRMED",
      1,
      "cancel-pay",
    );
    const cancelled = await service.transition(
      order.id,
      { id: customer, role: "CUSTOMER" },
      "CANCELLED",
      2,
      "cancel-order",
      "Changed purchase plans",
    );
    expect(cancelled.paymentStatus).toBe("REFUNDED");
    const [{ reserved }] = await source.query(
      `SELECT reserved FROM "${schema}".inventories WHERE product_id=$1`,
      [productId],
    );
    expect(reserved).toBe(1);
  });

  it("consumes the final promotion quota once under concurrent checkout", async () => {
    await source.query(
      `INSERT INTO "${schema}".promotions(id,code,amount,min_order_amount,starts_at,ends_at,total_quota) VALUES($1,'LAST',10000,0,now()-interval '1 day',now()+interval '1 day',1)`,
      [randomUUID()],
    );
    const results = await Promise.allSettled([
      service.checkout(customer, "promo-buyer-1", {
        ...input(),
        promoCode: "LAST",
      }),
      service.checkout(staff, "promo-buyer-2", {
        ...input(),
        promoCode: "LAST",
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [{ used_count }] = await source.query(
      `SELECT used_count FROM "${schema}".promotions WHERE code='LAST'`,
    );
    expect(used_count).toBe(1);
  });
  it("expires unpaid orders once and leaves paid orders reserved", async () => {
    const unpaid = await service.checkout(customer, "expiry-unpaid", input());
    const paid = await service.checkout(customer, "expiry-paid", input());
    await service.transition(
      paid.id,
      { id: customer, role: "CUSTOMER" },
      "CONFIRMED",
      1,
      "expiry-pay",
    );
    const future = new Date(Date.now() + 61 * 60 * 1000);
    expect(await service.expireDue(future)).toBeGreaterThan(0);
    expect(await service.expireDue(future)).toBe(0);
    expect((await service.detail(unpaid.id, customer)).status).toBe("EXPIRED");
    expect((await service.detail(paid.id, customer)).status).toBe("CONFIRMED");
    const [{ reserved }] = await source.query(
      `SELECT reserved FROM "${schema}".inventories WHERE product_id=$1`,
      [productId],
    );
    expect(reserved).toBe(1);
  });
  it("handles crossed taxonomy carts concurrently without deadlocking", async () => {
    const c1 = await catalog.createTaxonomy("categories", {
      name: "Cross X",
      slug: "cross-x",
    });
    const c2 = await catalog.createTaxonomy("categories", {
      name: "Cross Y",
      slug: "cross-y",
    });
    const brand = await catalog.createTaxonomy("brands", {
      name: "Cross",
      slug: "cross",
    });
    const products: string[] = [];
    for (let i = 0; i < 4; i++) {
      products.push(
        (
          await catalog.createProduct({
            sku: `CROSS-${i}`,
            slug: `cross-${i}`,
            name: "Cross product",
            description: "Demo",
            imageUrl: "https://example.test/demo.jpg",
            categoryId: c1.id,
            brandId: brand.id,
            price: 100000,
          })
        ).id,
      );
    }
    products.sort();
    for (let i = 0; i < 4; i++) {
      await source.query(
        `UPDATE "${schema}".products SET category_id=$2 WHERE id=$1`,
        [products[i], [c1.id, c2.id, c2.id, c1.id][i]],
      );
      await catalog.adjust(products[i]!, staff, `cross-stock-${i}`, {
        delta: 50,
        reason: "Concurrency test stock",
        expectedVersion: 1,
      });
    }
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        service.checkout(customer, `cross-cart-${i}`, {
          ...input(),
          items: (i % 2 === 0
            ? [products[0]!, products[2]!]
            : [products[1]!, products[3]!]
          ).map((id) => ({
            productId: id,
            quantity: 1,
            expectedUnitPrice: 100000,
          })),
        }),
      ),
    );
    expect(results.filter((r) => r.status === "rejected")).toEqual([]);
  });
});
