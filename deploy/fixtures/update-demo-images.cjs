const assert = require("node:assert/strict");
const { mkdir, writeFile } = require("node:fs/promises");
const data = require("./demo-catalog.cjs");
async function main() {
  const apply = process.argv.includes("--apply");
  const base = (
    process.env.SHOPFAST_DEMO_BASE_URL || "https://shopfast.tuanpq.com"
  ).replace(/\/$/, "");
  const images = (process.env.SHOPFAST_DEMO_IMAGE_ORIGIN || base).replace(
    /\/$/,
    "",
  );
  assert(
    process.env.DEMO_ADMIN_EMAIL && process.env.DEMO_ADMIN_PASSWORD,
    "Configure administrator credentials privately",
  );
  let token;
  async function api(path, body, method) {
    const r = await fetch(base + "/api/v1" + path, {
      method: method || (body ? "POST" : "GET"),
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    const b = await r.json();
    if (!r.ok) throw Error(`${path}: HTTP ${r.status} ${b.error?.code || ""}`);
    return b.data;
  }
  token = (
    await api("/auth/login", {
      email: process.env.DEMO_ADMIN_EMAIL,
      password: process.env.DEMO_ADMIN_PASSWORD,
    })
  ).accessToken;
  const rows = [];
  for (let page = 1; ; page++) {
    const r = await api(`/products?page=${page}&pageSize=100`);
    rows.push(...r.items);
    if (page * 100 >= r.total) break;
  }
  const changes = data.products
    .map((p) => {
      const current = rows.find((x) => x.sku === p.sku);
      assert(current, `Missing active demo SKU ${p.sku}`);
      assert(p.image, `Missing image for ${p.sku}`);
      return {
        sku: p.sku,
        id: current.id,
        previous: current.imageUrl,
        imageUrl: images + "/images/products/" + p.image,
        expectedVersion: current.version,
      };
    })
    .filter((p) => p.previous !== p.imageUrl);
  // Make every replacement file available before changing any catalog record.
  for (const p of changes) {
    const r = await fetch(p.imageUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(r.status, 200, `Image unavailable: ${p.sku}`);
    assert(r.headers.get("content-type")?.startsWith("image/"));
  }
  if (apply && changes.length) {
    await mkdir(".secrets", { recursive: true });
    await writeFile(
      ".secrets/catalog-images-before.json",
      JSON.stringify(changes, null, 2),
      { mode: 0o600 },
    );
    for (const p of changes) {
      await api(
        `/admin/products/${p.id}`,
        { imageUrl: p.imageUrl, expectedVersion: p.expectedVersion },
        "PATCH",
      );
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  console.log(
    JSON.stringify({
      mode: apply ? "apply" : "dry-run",
      changed: apply ? changes.length : 0,
      pending: changes.length,
      products: data.products.length,
    }),
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
