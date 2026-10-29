import * as jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { AddressInfo } from "node:net";
import { io, Socket } from "socket.io-client";
import { DataSource } from "typeorm";
import { createApiApp } from "../../apps/api/src/bootstrap";
import { AuthService } from "../../libs/modules/auth/src/application/auth.service";
import { CatalogService } from "../../libs/modules/catalog/src/application/catalog.service";
import { OrderService } from "../../libs/modules/orders/src/application/order.service";
import { createDataSource } from "../../libs/platform/src/database/data-source";

describe("realtime authorization and post-commit delivery", () => {
  let source: DataSource;
  let app: Awaited<ReturnType<typeof createApiApp>>;
  let auth: AuthService;
  let orders: OrderService;
  let base: string;
  const schema = `test_${randomUUID().replace(/-/g, "")}`;
  const secret = "realtime-test-access-secret-at-least-32-characters";
  const sockets: Socket[] = [];
  beforeAll(async () => {
    source = await createDataSource(
      process.env.TEST_DATABASE_URL!,
      schema,
    ).initialize();
    await source.query(`CREATE SCHEMA "${schema}"`);
    await source.runMigrations();
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.DATABASE_SCHEMA = schema;
    process.env.ACCESS_TOKEN_SECRET = secret;
    app = await createApiApp({ logger: false });
    await app.listen(0, "127.0.0.1");
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/orders`;
    auth = new AuthService(source, { schema, accessTokenSecret: secret });
    orders = new OrderService(source, schema);
  });
  afterAll(async () => {
    for (const s of sockets) s.disconnect();
    await app?.close();
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_SCHEMA;
    delete process.env.ACCESS_TOKEN_SECRET;
    if (source?.isInitialized) {
      await source.query(`DROP SCHEMA "${schema}" CASCADE`);
      await source.destroy();
    }
  });
  function connect(token: string) {
    const socket = io(base, {
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
      forceNew: true,
    });
    sockets.push(socket);
    return new Promise<Socket>((resolve, reject) => {
      socket.once("connect", () => resolve(socket));
      socket.once("connect_error", reject);
    });
  }
  it("rejects anonymous/unverified and denies another customer's subscription", async () => {
    await expect(connect("")).rejects.toThrow();
    const owner = await auth.register({
      email: "socket-owner@example.test",
      password: "correct horse battery",
      displayName: "Owner",
    });
    await expect(connect(owner.accessToken)).rejects.toThrow();
    const other = await auth.register({
      email: "socket-other@example.test",
      password: "correct horse battery",
      displayName: "Other",
    });
    await source.query(`UPDATE "${schema}".users SET email_verified_at=now()`);
    const expired = jwt.sign(
      {
        ...(jwt.decode(owner.accessToken) as jwt.JwtPayload),
        exp: Math.floor(Date.now() / 1000) - 60,
      },
      secret,
      { algorithm: "HS256" },
    );
    await expect(connect(expired)).rejects.toThrow();
    const catalog = new CatalogService(source, schema);
    const category = await catalog.createTaxonomy("categories", {
      name: "Socket",
      slug: "socket",
    });
    const brand = await catalog.createTaxonomy("brands", {
      name: "Socket",
      slug: "socket",
    });
    const product = await catalog.createProduct({
      sku: "SOCKET-1",
      slug: "socket-1",
      name: "Socket demo",
      description: "Demo",
      imageUrl: "https://example.test/demo.jpg",
      categoryId: category.id,
      brandId: brand.id,
      price: 100000,
    });
    await catalog.adjust(product.id, owner.user.id, "socket-stock", {
      delta: 2,
      reason: "Realtime test stock",
      expectedVersion: 1,
    });
    const order = await orders.checkout(owner.user.id, "socket-order", {
      items: [
        { productId: product.id, quantity: 1, expectedUnitPrice: 100000 },
      ],
      shippingAddress: {
        recipientName: "Socket Owner",
        addressLine: "123 Example Street",
        phone: "0901234567",
        ward: "Demo",
        province: "Demo",
      },
    });
    const ownSocket = await connect(owner.accessToken);
    const otherSocket = await connect(other.accessToken);
    expect(
      await otherSocket
        .timeout(2000)
        .emitWithAck("order.subscribe", { orderId: order.id }),
    ).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(
      await otherSocket
        .timeout(2000)
        .emitWithAck("order.subscribe", { orderId: randomUUID() }),
    ).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(
      await ownSocket
        .timeout(2000)
        .emitWithAck("order.subscribe", { orderId: order.id }),
    ).toMatchObject({ ok: true, currentVersion: 1 });
    const events: unknown[] = [];
    otherSocket.on("order.status.updated", (event) => events.push(event));
    const next = new Promise<Record<string, unknown>>((resolve) =>
      ownSocket.once("order.status.updated", resolve),
    );
    await orders.transition(
      order.id,
      { id: owner.user.id, role: "CUSTOMER" },
      "CONFIRMED",
      1,
      "socket-payment",
    );
    const event = await next;
    expect(event).toMatchObject({
      orderId: order.id,
      status: "CONFIRMED",
      version: 2,
    });
    expect(JSON.stringify(event)).not.toMatch(/address|phone|customerId/);
    expect(events).toHaveLength(0);
    const leaked = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        otherSocket.off("order.status.updated", listener);
        resolve(false);
      }, 200);
      const listener = () => {
        clearTimeout(timer);
        resolve(true);
      };
      otherSocket.once("order.status.updated", listener);
    });
    expect(leaked).toBe(false);
    expect(events).toHaveLength(0);
    const disconnected = new Promise<void>((resolve) =>
      ownSocket.once("disconnect", () => resolve()),
    );
    await auth.logout(owner.refreshToken);
    await disconnected;
    expect(ownSocket.connected).toBe(false);
  }, 20000);
});
