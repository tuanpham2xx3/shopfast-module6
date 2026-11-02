const assert = require("node:assert/strict");
const data = require("./demo-catalog.cjs");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const apply = process.argv.includes("--apply");
  const base = (
    process.env.SHOPFAST_DEMO_BASE_URL || "https://shopfast.tuanpq.com"
  ).replace(/\/$/, "");
  const imageOrigin = (process.env.SHOPFAST_DEMO_IMAGE_ORIGIN || base).replace(
    /\/$/,
    "",
  );
  assert(
    process.env.DEMO_ADMIN_EMAIL && process.env.DEMO_ADMIN_PASSWORD,
    "Configure demo administrator credentials in process environment",
  );
  assert.equal(data.products.length, 42);
  assert.equal(new Set(data.products.map((p) => p.sku)).size, 42);
  assert.equal(new Set(data.products.map((p) => p.slug)).size, 42);
  assert(
    data.products.every(
      (p) =>
        Number.isInteger(p.price) &&
        p.price > 0 &&
        Number.isInteger(p.stock) &&
        p.stock >= 0,
    ),
  );
  let token;
  async function request(path, body, key, attempt = 0) {
    const r = await fetch(base + "/api/v1" + path, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    if (r.status === 429 && attempt < 2) {
      const seconds = Number(r.headers.get("retry-after") || 60);
      assert(
        seconds > 0 && seconds <= 60,
        "Rate limit wait outside bounded range",
      );
      await wait(seconds * 1000);
      return request(path, body, key, attempt + 1);
    }
    const b = await r.json();
    if (!r.ok)
      throw Error(
        `${body ? "POST" : "GET"} ${path}: HTTP ${r.status} ${b.error?.code || ""}`,
      );
    await wait(150);
    return b.data;
  }
  token = (
    await request("/auth/login", {
      email: process.env.DEMO_ADMIN_EMAIL,
      password: process.env.DEMO_ADMIN_PASSWORD,
    })
  ).accessToken;
  const inventory = new Map();
  for (let page = 1; ; page++) {
    const r = await request(`/staff/inventory?page=${page}&pageSize=100`);
    for (const row of r.items) inventory.set(row.sku, row);
    if (page * 100 >= r.total) break;
  }
  for (const p of data.products)
    if (inventory.has(p.sku))
      assert.equal(
        inventory.get(p.sku).name,
        p.name,
        `SKU collision: ${p.sku}`,
      );
  if (!apply) {
    console.log(
      JSON.stringify({
        mode: "dry-run",
        planned: 42,
        missing: data.products.filter((p) => !inventory.has(p.sku)).length,
        existing: data.products.filter((p) => inventory.has(p.sku)).length,
      }),
    );
    return;
  }
  const ids = { categories: new Map(), brands: new Map() };
  for (const kind of ["categories", "brands"]) {
    for (const row of await request("/" + kind))
      ids[kind].set(row.slug, row.id);
    for (const input of data[kind])
      if (!ids[kind].has(input.slug)) {
        const row = await request("/admin/" + kind, input);
        ids[kind].set(input.slug, row.id);
      }
  }
  let created = 0,
    stockInitialized = 0,
    skipped = 0;
  for (const p of data.products) {
    let row = inventory.get(p.sku);
    if (!row) {
      const product = await request("/admin/products", {
        sku: p.sku,
        slug: p.slug,
        name: p.name,
        description: p.description,
        imageUrl: imageOrigin + "/images/products/" + p.image,
        price: p.price,
        categoryId: ids.categories.get(p.categorySlug),
        brandId: ids.brands.get(p.brandSlug),
      });
      row = { productId: product.id, version: 1, onHand: 0, reserved: 0 };
      created++;
    } else skipped++;
    // Recover an interrupted first seed, but never replenish used/edited inventory.
    if (
      p.stock > 0 &&
      row.version === 1 &&
      row.onHand === 0 &&
      row.reserved === 0
    ) {
      await request(
        `/staff/inventory/${row.productId}/adjustments`,
        {
          delta: p.stock,
          reason: "Initial stock for synthetic pagination demo",
          expectedVersion: 1,
        },
        `demo-catalog-v1-stock-${p.sku}`,
      );
      stockInitialized++;
    }
  }
  console.log(
    JSON.stringify({
      mode: "apply",
      created,
      skipped,
      stockInitialized,
      planned: 42,
    }),
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
