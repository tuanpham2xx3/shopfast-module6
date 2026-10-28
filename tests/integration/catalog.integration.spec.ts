import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import { createDataSource } from "../../libs/platform/src/database/data-source";
import { CatalogService } from "../../libs/modules/catalog/src/catalog.service";

describe("catalog and inventory integration", () => {
  let source: DataSource;
  let service: CatalogService;
  const schema = `test_${randomUUID().replace(/-/g, "")}`;
  let productId: string;
  let categoryId: string;
  let brandId: string;
  beforeAll(async () => {
    source = await createDataSource(
      process.env.TEST_DATABASE_URL!,
      schema,
    ).initialize();
    await source.query(`CREATE SCHEMA "${schema}"`);
    await source.runMigrations();
    service = new CatalogService(source, schema);
    categoryId = (
      await service.createTaxonomy("categories", {
        name: "Audio",
        slug: "audio",
      })
    ).id;
    brandId = (
      await service.createTaxonomy("brands", { name: "Demo", slug: "demo" })
    ).id;
    productId = (
      await service.createProduct({
        sku: "AUDIO-1",
        slug: "audio-1",
        name: "Headphones",
        description: "Demo headphones",
        imageUrl: "https://example.test/product.jpg",
        categoryId,
        brandId,
        price: 200000,
      })
    ).id;
  });
  afterAll(async () => {
    if (source?.isInitialized) {
      await source.query(`DROP SCHEMA "${schema}" CASCADE`);
      await source.destroy();
    }
  });
  it("creates zero stock and combines all public filters", async () => {
    expect(await service.product(productId)).toMatchObject({
      price: 200000,
      available: 0,
      version: 1,
    });
    expect(
      await service.products({
        categoryId,
        brandId,
        minPrice: 100000,
        maxPrice: 300000,
      }),
    ).toMatchObject({ total: 1 });
    expect(
      await service.products({ categoryId, minPrice: 300000 }),
    ).toMatchObject({ total: 0 });
  });
  it("serializes concurrent stock adjustments and replays a matching key", async () => {
    const actor = randomUUID();
    const input = { delta: 5, reason: "Initial delivery", expectedVersion: 1 };
    const results = await Promise.allSettled([
      service.adjust(productId, actor, "initial-stock", input),
      service.adjust(productId, actor, "other-stock", input),
    ]);
    expect(
      results.filter((entry) => entry.status === "fulfilled"),
    ).toHaveLength(1);
    const winner =
      results[0].status === "fulfilled" ? "initial-stock" : "other-stock";
    expect(await service.adjust(productId, actor, winner, input)).toMatchObject(
      { onHand: 5, version: 2 },
    );
    await expect(
      service.adjust(productId, actor, winner, { ...input, delta: 6 }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect((await service.movements(productId, {})).total).toBe(1);
    await expect(
      service.adjust(productId, actor, "negative-stock", {
        delta: -6,
        reason: "Remove damaged units",
        expectedVersion: 2,
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect(await service.product(productId)).toMatchObject({ available: 5 });
  });
  it("hides products whose category is inactive and enforces versions", async () => {
    await service.updateProduct(productId, {
      expectedVersion: 1,
      price: 210000,
    });
    await expect(
      service.updateProduct(productId, { expectedVersion: 1, price: 220000 }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await service.updateTaxonomy("categories", categoryId, { active: false });
    expect((await service.products({})).total).toBe(0);
    await expect(service.product(productId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
