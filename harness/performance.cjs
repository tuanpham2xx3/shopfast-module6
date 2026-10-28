// Run inside the Linux runtime image, against an explicitly isolated fixture schema/Redis DB.
const fs = require("fs");
const { randomUUID } = require("crypto");
const jwt = require("jsonwebtoken");
const {
  createDataSource,
} = require("/app/dist-tools/libs/platform/src/database/data-source.js");
const { io } = require("socket.io-client");
const mode = process.argv[2];
const schema = process.env.DATABASE_SCHEMA;
if (!/^harness_load_[0-9]+$/.test(schema || ""))
  throw new Error("Isolated load schema required");
const url = `postgresql://shopfast:${process.env.POSTGRES_PASSWORD}@postgres:5432/shopfast`;
const source = createDataSource(url, schema);
source.setOptions({ extra: { max: 5, statement_timeout: 60000 } });
const t = (n) => `"${schema}".${n}`;
async function main() {
  await source.initialize();
  if (mode === "seed") {
    await source.query(`CREATE SCHEMA "${schema}"`);
    await source.runMigrations();
    await source.query(
      `INSERT INTO ${t("users")}(id,email,password_hash,display_name,role,email_verified_at) SELECT gen_random_uuid(),'load-'||g||'@example.test','not-login-enabled','Synthetic load','CUSTOMER',now() FROM generate_series(1,200000)g`,
    );
    await source.query(
      `INSERT INTO ${t("users")}(id,email,password_hash,display_name,role,email_verified_at) VALUES(gen_random_uuid(),'warehouse@example.test','not-login-enabled','Load Warehouse','WAREHOUSE',now())`,
    );
    await source.query(
      `INSERT INTO ${t("users")}(id,email,password_hash,display_name,role,email_verified_at) VALUES(gen_random_uuid(),'admin@example.test','not-login-enabled','Load Admin','ADMIN',now())`,
    );
    await source.query(
      `INSERT INTO ${t("categories")}(id,name,slug) VALUES(gen_random_uuid(),'Load','load')`,
    );
    await source.query(
      `INSERT INTO ${t("brands")}(id,name,slug) VALUES(gen_random_uuid(),'Load','load')`,
    );
    await source.query(
      `INSERT INTO ${t("products")}(id,sku,slug,name,description,image_url,category_id,brand_id,price) SELECT gen_random_uuid(),'LOAD-'||g,'load-'||g,'Synthetic item '||g,'Fixture only','https://example.test/image.png',c.id,b.id,100000 FROM generate_series(1,10000)g CROSS JOIN ${t("categories")} c CROSS JOIN ${t("brands")} b`,
    );
    await source.query(
      `INSERT INTO ${t("inventories")}(product_id,on_hand) SELECT id,1000000 FROM ${t("products")}`,
    );
    await source.query(
      `INSERT INTO ${t("orders")}(id,code,customer_id,status,payment_status,subtotal,discount,total,address_snapshot,expires_at) SELECT gen_random_uuid(),'LOAD-'||row_number()OVER(),id,'CONFIRMED','PAID',100000,0,100000,'{}',now()+interval '1 day' FROM ${t("users")} WHERE role='CUSTOMER' LIMIT 100000`,
    );
    console.log(
      "Seeded 200000 customers,10000 products,100000 orders in isolated schema",
    );
    return;
  }
  if (mode === "cleanup") {
    await source.query(`DROP SCHEMA "${schema}" CASCADE`);
    return;
  }
  const target = "https://shopfast.tuanpq.com:4443";
  const actors = await source.query(
    `SELECT id,role FROM ${t("users")} WHERE role='CUSTOMER' ORDER BY id LIMIT 160`,
  );
  actors.push(
    ...(await source.query(
      `SELECT id,role FROM ${t("users")} WHERE role IN ('WAREHOUSE','ADMIN')`,
    )),
  );
  for (const a of actors) {
    const sid = randomUUID();
    await source.query(
      `INSERT INTO ${t("auth_sessions")}(id,user_id,token_family_id,refresh_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '1 hour')`,
      [sid, a.id, randomUUID(), randomUUID()],
    );
    a.token = jwt.sign({ sid, role: a.role }, process.env.ACCESS_TOKEN_SECRET, {
      subject: a.id,
      issuer: "shopfast",
      audience: "shopfast-api",
      expiresIn: "1h",
    });
  }
  const products = await source.query(
    `SELECT id,sku FROM ${t("products")} ORDER BY id LIMIT 30`,
  );
  const samples = { catalog: [], checkout: [], secondRead: [], realtime: [] };
  let failures = 0,
    rateLimited = 0;
  async function request(path, actor, body) {
    const start = performance.now();
    const r = await fetch(target + "/api/v1" + path, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + actor.token,
        "Content-Type": "application/json",
        "Idempotency-Key": randomUUID(),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) {
      if (r.status === 429) rateLimited++;
      else failures++;
    }
    const json = await r.json();
    return { ms: performance.now() - start, ok: r.ok, data: json.data };
  }
  for (let i = 0; i < 30; i++) {
    await request("/products/" + products[0].id, actors[0]);
    const r = await request("/products/" + products[0].id, actors[0]);
    samples.secondRead.push(r.ms);
  }
  // Realtime is a separate scenario; fixture orders do not send real email or Gemini traffic.
  const sockets = [];
  try {
    const warehouse = actors.find((a) => a.role === "WAREHOUSE");
    for (let i = 0; i < 100; i++) {
      const a = actors[60 + i];
      const id = randomUUID();
      await source.query(
        `INSERT INTO ${t("orders")}(id,code,customer_id,status,payment_status,subtotal,discount,total,address_snapshot,expires_at) VALUES($1,$2,$3,'CONFIRMED','PAID',100000,0,100000,'{}',now()+interval '1 hour')`,
        [id, "SOCKET-" + id, a.id],
      );
      const socket = io(target + "/orders", {
        auth: { token: a.token },
        transports: ["websocket"],
        timeout: 10000,
      });
      sockets.push({ socket, id });
      await new Promise((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("connect_error", reject);
      });
      const ack = await socket
        .timeout(10000)
        .emitWithAck("order.subscribe", { orderId: id });
      if (!ack.ok) throw new Error("Fixture subscription failed");
    }
    for (const { socket, id } of sockets) {
      const event = new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Lost realtime event")),
          5000,
        );
        socket.once("order.status.updated", (e) => {
          clearTimeout(timer);
          samples.realtime.push(Date.now() - new Date(e.occurredAt).getTime());
          resolve();
        });
      });
      const r = await fetch(target + "/api/v1/staff/orders/" + id + "/status", {
        method: "PATCH",
        headers: {
          Authorization: "Bearer " + warehouse.token,
          "Content-Type": "application/json",
          "Idempotency-Key": randomUUID(),
        },
        body: JSON.stringify({
          expectedVersion: 1,
          targetStatus: "PROCESSING",
        }),
      });
      if (!r.ok) throw new Error("Realtime fixture transition failed");
      await event;
    }
  } finally {
    for (const { socket } of sockets) socket.disconnect();
  }
  const warmup = 120000,
    measure = 600000;
  const admin = actors.find((a) => a.role === "ADMIN");
  let metricsBefore;
  const metricTimer = setTimeout(async () => {
    try {
      metricsBefore = (await request("/admin/health", admin)).data.cache
        .metrics;
    } catch {
      failures++;
    }
  }, warmup);
  async function vu(actor, index, checkout) {
    const started = Date.now();
    let next = started;
    while (Date.now() - started < warmup + measure) {
      const measured = Date.now() - started >= warmup;
      const p = products[checkout ? 20 + (index % 10) : index % 20];
      const r = checkout
        ? await request("/orders", actor, {
            items: [
              { productId: p.id, quantity: 1, expectedUnitPrice: 100000 },
            ],
            shippingAddress: {
              recipientName: "Load fixture",
              addressLine: "123 Synthetic Road",
              phone: "0901234567",
              ward: "Fixture",
              province: "Fixture",
            },
          })
        : await request(
            index % 3 ? "/products/" + p.id : "/products?page=1&pageSize=20",
            actor,
          );
      if (measured && r.ok)
        samples[checkout ? "checkout" : "catalog"].push(r.ms);
      next += checkout ? 6500 : 1000;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(0, next - Date.now())),
      );
    }
  }
  await Promise.all([
    ...actors.slice(0, 50).map((a, i) => vu(a, i, false)),
    ...actors.slice(50, 60).map((a, i) => vu(a, i, true)),
  ]);
  const stats = Object.fromEntries(
    Object.entries(samples).map(([k, v]) => {
      v.sort((a, b) => a - b);
      return [
        k,
        {
          count: v.length,
          p95: v[Math.max(0, Math.ceil(v.length * 0.95) - 1)] ?? null,
          max: v.at(-1) ?? null,
        },
      ];
    }),
  );
  clearTimeout(metricTimer);
  const metricsAfter = (await request("/admin/health", admin)).data.cache
    .metrics;
  const hits = metricsAfter.hit - (metricsBefore?.hit ?? 0),
    misses = metricsAfter.miss - (metricsBefore?.miss ?? 0);
  const cacheHitRate = hits / (hits + misses || 1);
  const status =
    stats.catalog.p95 < 50 &&
    stats.checkout.p95 < 300 &&
    stats.secondRead.p95 < 20 &&
    stats.realtime.max < 1000 &&
    failures === 0 &&
    rateLimited === 0 &&
    cacheHitRate >= 0.8
      ? "PASS"
      : "FAIL";
  fs.writeFileSync(
    "/reports/performance.json",
    JSON.stringify(
      {
        status,
        executedAt: new Date().toISOString(),
        fixtureSchema: schema,
        dataset: { customers: 200000, products: 10000, orders: 100000 },
        warmupMs: warmup,
        measureMs: measure,
        vus: { catalog: 50, checkout: 10, sockets: 100 },
        stats,
        failures,
        rateLimited,
        cacheHitRate,
        limitations: [
          "Single host load generator competes for CPU with services",
          "Fixture worker intentionally not sending provider traffic",
        ],
        acceptance: status,
      },
      null,
      2,
    ),
  );
  if (status !== "PASS") process.exitCode = 1;
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => source.isInitialized && source.destroy());
