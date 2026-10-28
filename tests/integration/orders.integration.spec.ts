import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import { createDataSource } from "../../libs/platform/src/database/data-source";
import { CatalogService } from "../../libs/modules/catalog/catalog.service";
import { OrderService } from "../../libs/modules/orders/order.service";
import {
  JobsService,
  DevelopmentEmailAdapter,
} from "../../libs/modules/jobs/jobs.service";

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
    const winner = results.find(
      (result) => result.status === "fulfilled",
    ) as PromiseFulfilledResult<Awaited<ReturnType<OrderService["checkout"]>>>;
    const [owner] = await source.query(
      `SELECT customer_id FROM "${schema}".orders WHERE id=$1`,
      [winner.value.id],
    );
    await service.transition(
      winner.value.id,
      { id: owner.customer_id, role: "CUSTOMER" },
      "CANCELLED",
      1,
      "promo-cancel",
      "Cancelled promotional order",
    );
    expect(
      (
        await source.query(
          `SELECT used_count FROM "${schema}".promotions WHERE code='LAST'`,
        )
      )[0].used_count,
    ).toBe(1);
    // Increase only this isolated test's total quota to distinguish per-customer
    // redemption protection from the unrelated exhausted-quota condition.
    await source.query(
      `UPDATE "${schema}".promotions SET total_quota=5 WHERE code='LAST'`,
    );
    await expect(
      service.checkout(owner.customer_id, "promo-cannot-reuse-after-cancel", {
        ...input(),
        promoCode: "LAST",
      }),
    ).rejects.toMatchObject({ code: "PROMO_NOT_ELIGIBLE" });
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

  async function acceptanceProduct(stock = 3) {
    const id = randomUUID();
    const [taxonomy] = await source.query(
      `SELECT category_id,brand_id FROM "${schema}".products WHERE id=$1`,
      [productId],
    );
    const product = await catalog.createProduct({
      sku: id,
      slug: id,
      name: "Acceptance product",
      description: "Synthetic isolated stock",
      imageUrl: "https://example.test/demo.jpg",
      categoryId: taxonomy.category_id,
      brandId: taxonomy.brand_id,
      price: 100000,
    });
    if (stock)
      await catalog.adjust(product.id, staff, `stock-${id}`, {
        delta: stock,
        reason: "Acceptance stock",
        expectedVersion: 1,
      });
    return product.id;
  }
  const purchase = (id: string) => ({
    ...input(),
    items: [{ productId: id, quantity: 1, expectedUnitPrice: 100000 }],
  });

  it("CART-01 adds, changes and removes a SKU without reserving stock and rejects boundary quantities", async () => {
    const id = await acceptanceProduct();
    await service.addCart(customer, id, 1);
    await service.addCart(customer, id, 2);
    expect(
      (await service.cart(customer)).items.find(
        (item: { productId: string }) => item.productId === id,
      ).quantity,
    ).toBe(3);
    await service.setCart(customer, id, 4);
    for (const quantity of [0, 100]) {
      await expect(
        service.addCart(customer, id, quantity),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(
        service.setCart(customer, id, quantity),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    const [stock] = await source.query(
      `SELECT on_hand,reserved FROM "${schema}".inventories WHERE product_id=$1`,
      [id],
    );
    expect(stock).toMatchObject({ on_hand: 3, reserved: 0 });
    await service.removeCart(customer, id);
    expect(
      (await service.cart(customer)).items.some(
        (item: { productId: string }) => item.productId === id,
      ),
    ).toBe(false);
  });

  it("ORD-03 rolls back reservations, cart, order and outbox when the second real SKU is out of stock", async () => {
    const stocked = await acceptanceProduct(),
      empty = await acceptanceProduct(0);
    await service.addCart(customer, stocked, 1);
    const snapshot = async () =>
      (
        await source.query(
          `SELECT (SELECT count(*)::int FROM "${schema}".orders) orders,(SELECT count(*)::int FROM "${schema}".outbox_events) events,(SELECT quantity FROM "${schema}".cart_items WHERE user_id=$1 AND product_id=$2) cart,(SELECT reserved FROM "${schema}".inventories WHERE product_id=$2) reserved`,
          [customer, stocked],
        )
      )[0];
    const before = await snapshot();
    await expect(
      service.checkout(customer, "real-two-item-rollback", {
        ...purchase(stocked),
        items: [...purchase(stocked).items, ...purchase(empty).items],
      }),
    ).rejects.toMatchObject({ code: "OUT_OF_STOCK" });
    expect(await snapshot()).toEqual(before);
  });

  it("ORD-04 concurrent identical keys create one order and replay after service restart", async () => {
    const id = await acceptanceProduct(),
      body = purchase(id);
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        service.checkout(customer, "concurrent-identical", body),
      ),
    );
    const successes = results.filter(
      (
        r,
      ): r is PromiseFulfilledResult<
        Awaited<ReturnType<OrderService["checkout"]>>
      > => r.status === "fulfilled",
    );
    expect(successes.length).toBeGreaterThan(0);
    expect(new Set(successes.map((r) => r.value.id)).size).toBe(1);
    for (const rejected of results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    ))
      expect(rejected.reason.code).toBe("REQUEST_IN_PROGRESS");
    const restarted = new OrderService(source, schema);
    expect(
      await restarted.checkout(customer, "concurrent-identical", body),
    ).toEqual(successes[0]!.value);
    const [stock] = await source.query(
      `SELECT reserved FROM "${schema}".inventories WHERE product_id=$1`,
      [id],
    );
    expect(stock.reserved).toBe(1);
    await expect(
      restarted.checkout(customer, "concurrent-identical", {
        ...body,
        items: [{ ...body.items[0]!, quantity: 2 }],
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("ORD-06 serializes payment, cancellation and expiry with one history transition and valid reservations", async () => {
    const id = await acceptanceProduct(),
      order = await service.checkout(customer, "race-order", purchase(id));
    await Promise.allSettled([
      service.transition(
        order.id,
        { id: customer, role: "CUSTOMER" },
        "CONFIRMED",
        1,
        "race-pay",
      ),
      service.transition(
        order.id,
        { id: customer, role: "CUSTOMER" },
        "CANCELLED",
        1,
        "race-cancel",
        "Concurrent cancellation",
      ),
      service.expireDue(new Date(Date.now() + 61 * 60000)),
    ]);
    const final = await service.detail(order.id, customer);
    expect(["CONFIRMED", "CANCELLED", "EXPIRED"]).toContain(final.status);
    expect(final.version).toBe(2);
    const [history] = await source.query(
      `SELECT count(*)::int count FROM "${schema}".order_status_history WHERE order_id=$1 AND order_version=2`,
      [order.id],
    );
    expect(history.count).toBe(1);
    const [stock] = await source.query(
      `SELECT on_hand,reserved FROM "${schema}".inventories WHERE product_id=$1`,
      [id],
    );
    expect(stock.on_hand).toBe(3);
    expect(stock.reserved).toBe(final.status === "CONFIRMED" ? 1 : 0);
    expect(final.paymentStatus).toBe(
      final.status === "CONFIRMED" ? "PAID" : "UNPAID",
    );
  });

  it("ORD-10 rejects reducing on-hand below reserved without changing stock or movements", async () => {
    const id = await acceptanceProduct(2);
    await service.checkout(customer, "reserved-reduction", purchase(id));
    const [before] = await source.query(
      `SELECT * FROM "${schema}".inventories WHERE product_id=$1`,
      [id],
    );
    const [movements] = await source.query(
      `SELECT count(*)::int count FROM "${schema}".inventory_movements WHERE product_id=$1`,
      [id],
    );
    await expect(
      catalog.adjust(id, staff, "unsafe-reduction", {
        delta: -2,
        reason: "Cannot remove reserved units",
        expectedVersion: before.version,
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect(
      (
        await source.query(
          `SELECT * FROM "${schema}".inventories WHERE product_id=$1`,
          [id],
        )
      )[0],
    ).toEqual(before);
    expect(
      (
        await source.query(
          `SELECT count(*)::int count FROM "${schema}".inventory_movements WHERE product_id=$1`,
          [id],
        )
      )[0],
    ).toEqual(movements);
  });

  it("ORD-08 rejects stale and skipped transitions without changing order, stock or outbox", async () => {
    const id = await acceptanceProduct(),
      order = await service.checkout(customer, "stale-guard", purchase(id));
    const before = await service.detail(order.id, customer);
    const snapshot = async () =>
      (
        await source.query(
          `SELECT (SELECT reserved FROM "${schema}".inventories WHERE product_id=$1) reserved,(SELECT count(*)::int FROM "${schema}".outbox_events WHERE aggregate_id=$2) events`,
          [id, order.id],
        )
      )[0];
    const state = await snapshot();
    await expect(
      service.transition(
        order.id,
        { id: staff, role: "WAREHOUSE" },
        "SHIPPING",
        1,
        "skip-transition",
      ),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(
      service.transition(
        order.id,
        { id: customer, role: "CUSTOMER" },
        "CONFIRMED",
        0,
        "stale-transition",
      ),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(await service.detail(order.id, customer)).toEqual(before);
    expect(await snapshot()).toEqual(state);
  });

  it("JOB-01 checkout commits outbox while an email provider is still delayed for five seconds", async () => {
    let begin!: () => void,
      finished = false;
    const started = new Promise<void>((resolve) => {
      begin = resolve;
    });
    const jobs = new JobsService(
      source,
      {
        mode: "deterministic-slow-fixture",
        send: async () => {
          begin();
          await new Promise((resolve) => setTimeout(resolve, 5000));
          finished = true;
        },
      },
      "s".repeat(40),
      schema,
    );
    await jobs.enqueue("slow-provider-fixture", "email.verification", {
      recipient: "synthetic@example.test",
    });
    const worker = jobs.drain(1, "slow-provider-fixture");
    try {
      await started;
      const id = await acceptanceProduct();
      const order = await service.checkout(
        customer,
        "slow-provider-checkout",
        purchase(id),
      );
      expect(finished).toBe(false);
      expect((await service.detail(order.id, customer)).status).toBe(
        "PENDING_PAYMENT",
      );
      const [event] = await source.query(
        `SELECT count(*)::int count FROM "${schema}".outbox_events WHERE aggregate_id=$1 AND type='order.created'`,
        [order.id],
      );
      expect(event.count).toBe(1);
    } finally {
      await worker;
    }
    expect(finished).toBe(true);
  });

  it("JOB-07 creates one invoice only after payment and none for cancelled unpaid orders", async () => {
    const id = await acceptanceProduct(),
      order = await service.checkout(
        customer,
        "invoice-lifecycle",
        purchase(id),
      );
    const jobs = new JobsService(
      source,
      new DevelopmentEmailAdapter(source, schema),
      "s".repeat(40),
      schema,
    );
    const event = (type: string, orderId: string) => ({
      id: randomUUID(),
      businessKey: randomUUID(),
      type,
      aggregateId: orderId,
      payload: {},
    });
    await jobs.route(event("order.created", order.id));
    expect(
      (
        await source.query(
          `SELECT count(*)::int count FROM "${schema}".job_executions WHERE type='invoice.generate' AND payload->>'orderId'=$1`,
          [order.id],
        )
      )[0].count,
    ).toBe(0);
    await service.transition(
      order.id,
      { id: customer, role: "CUSTOMER" },
      "CONFIRMED",
      1,
      "invoice-payment",
    );
    await jobs.route(event("payment.confirmed", order.id));
    await jobs.route(event("payment.confirmed", order.id));
    await jobs.drain(1, `invoice:${order.id}:v1`);
    expect(
      (
        await source.query(
          `SELECT count(*)::int count FROM "${schema}".invoices WHERE order_id=$1`,
          [order.id],
        )
      )[0].count,
    ).toBe(1);
    const cancelled = await service.checkout(
      customer,
      "invoice-unpaid-cancel",
      purchase(id),
    );
    await service.transition(
      cancelled.id,
      { id: customer, role: "CUSTOMER" },
      "CANCELLED",
      1,
      "invoice-cancel",
      "Cancelled before payment",
    );
    await jobs.enqueue(`invoice:${cancelled.id}:v1`, "invoice.generate", {
      orderId: cancelled.id,
    });
    await jobs.drain(1, `invoice:${cancelled.id}:v1`);
    expect(
      (
        await source.query(
          `SELECT count(*)::int count FROM "${schema}".invoices WHERE order_id=$1`,
          [cancelled.id],
        )
      )[0].count,
    ).toBe(0);
  });
});
