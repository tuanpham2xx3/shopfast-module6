const fs = require("fs");
const Redis = require("ioredis");
const {
  createDataSource,
} = require("/app/dist-tools/libs/platform/src/database/data-source.js");
const {
  CatalogService,
} = require("/app/dist-tools/libs/modules/catalog/src/catalog.service.js");
const {
  CatalogCache,
} = require("/app/dist-tools/libs/modules/runtime/src/catalog-cache.js");
const schema = process.env.DATABASE_SCHEMA;
if (!/^harness_recovery_[0-9]+$/.test(schema || ""))
  throw new Error("Isolated schema required");
const source = createDataSource(
  `postgresql://shopfast:${process.env.POSTGRES_PASSWORD}@postgres:5432/shopfast`,
  schema,
);
const redis = new Redis("redis://shopfast-harness-redis:6379", {
  maxRetriesPerRequest: 0,
  enableOfflineQueue: false,
  commandTimeout: 200,
  lazyConnect: true,
  retryStrategy: () => null,
});
redis.on("error", () => {});
async function wait(name) {
  const until = Date.now() + 30000;
  while (Date.now() < until) {
    if (fs.existsSync("/reports/" + name)) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("Outage phase timeout");
}
async function main() {
  await source.initialize();
  await source.query(`CREATE SCHEMA "${schema}"`);
  await source.runMigrations();
  try {
    await redis.connect();
    let now = Date.now();
    const cache = new CatalogCache(redis, () => now);
    const catalog = new CatalogService(source, schema, cache);
    const c = await catalog.createTaxonomy("categories", {
        name: "Fixture",
        slug: "fixture",
      }),
      b = await catalog.createTaxonomy("brands", {
        name: "Fixture",
        slug: "fixture",
      });
    const p = await catalog.createProduct({
      sku: "OUTAGE",
      slug: "outage",
      name: "Synthetic fixture",
      description: "Fixture",
      imageUrl: "https://example.test/p.png",
      categoryId: c.id,
      brandId: b.id,
      price: 100,
    });
    await catalog.product(p.id);
    await catalog.product(p.id);
    fs.writeFileSync("/reports/cache-warm-marker", "ready");
    await wait("redis-down-marker");
    const updated = await catalog.updateProduct(p.id, {
      expectedVersion: 1,
      price: 200,
    });
    if (!updated.cacheInvalidationPending)
      throw new Error("Expected pending invalidation during outage");
    if ((await catalog.product(p.id)).price !== 200)
      throw new Error("Stale price during Redis outage");
    fs.writeFileSync("/reports/cache-down-validated", "ready");
    await wait("redis-up-marker");
    if (redis.status !== "ready") await redis.connect();
    if (!(await cache.retryPending()))
      throw new Error("Invalidation did not recover");
    now += 6000;
    if ((await catalog.product(p.id)).price !== 200)
      throw new Error("Stale price after Redis recovery");
    await catalog.product(p.id);
    if (cache.metrics.hit < 2)
      throw new Error("Cache did not resume after recovery");
    fs.writeFileSync(
      "/reports/redis-outage.json",
      JSON.stringify(
        {
          status: "PASS",
          executedAt: new Date().toISOString(),
          checks: [
            "warm real Redis cache",
            "price mutation while Redis process stopped",
            "DB fallback serves new price",
            "restart and targeted invalidation before cache resumes",
          ],
        },
        null,
        2,
      ),
    );
    console.log("Redis process outage/recovery4checks PASS");
  } finally {
    await source.query(`DROP SCHEMA "${schema}" CASCADE`);
  }
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    redis.disconnect();
    if (source.isInitialized) await source.destroy();
  });
