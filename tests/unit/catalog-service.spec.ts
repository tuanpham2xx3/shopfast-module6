import { CatalogService } from "../../libs/modules/catalog/catalog.service";
import { DataSource } from "typeorm";
import { createHash } from "node:crypto";
import { CatalogCache } from "../../libs/modules/runtime/catalog-cache";
function fixture(results: unknown[] = [], cache?: CatalogCache) {
  const query = jest.fn();
  for (const value of results) query.mockResolvedValueOnce(value);
  query.mockResolvedValue([]);
  const source = {
    query,
    transaction: async (fn: (m: { query: typeof query }) => Promise<unknown>) =>
      fn({ query }),
  } as unknown as DataSource;
  return new CatalogService(source, "public", cache);
}
const taxonomy = {
  id: "category",
  name: "Category",
  slug: "category",
  active: true,
};
const product = {
  sku: "SKU",
  slug: "sku",
  name: "Product",
  description: "Description",
  imageUrl: "https://example.test/p.png",
  categoryId: "category",
  brandId: "brand",
  price: 100,
};
describe("catalog and inventory domain contracts", () => {
  it("creates taxonomy and products while reporting pending cache invalidation", async () => {
    expect(
      await fixture([[taxonomy], []]).createTaxonomy("categories", {
        name: " Category ",
        slug: "category",
      }),
    ).toEqual(taxonomy);
    expect(
      await fixture([
        [{ id: "p" }],
        [],
        [{ category_id: "category", brand_id: "brand" }],
        [],
      ]).createProduct(product),
    ).toEqual({ id: "p" });
    const cache = {
      invalidate: jest.fn().mockResolvedValue(false),
    } as unknown as CatalogCache;
    expect(
      await fixture([[taxonomy], []], cache).createTaxonomy("brands", {
        name: "Category",
        slug: "category",
      }),
    ).toMatchObject({ cacheInvalidationPending: true });
  });
  it("invalidates both old/new taxonomy on product changes and refuses stale writes", async () => {
    expect(
      await fixture([
        [{ category_id: "old", brand_id: "old" }],
        [[{ id: "p", version: 2 }]],
        [],
        [],
      ]).updateProduct("p", {
        expectedVersion: 1,
        categoryId: "new",
        price: 200,
      }),
    ).toEqual({ id: "p", version: 2 });
    await expect(
      fixture([[], [[]]]).updateProduct("missing", {
        expectedVersion: 1,
        name: "x",
      }),
    ).rejects.toThrow("VERSION_CONFLICT");
    expect(
      await fixture([[[taxonomy]], [], [], []]).updateTaxonomy(
        "categories",
        "category",
        { active: false },
      ),
    ).toEqual(taxonomy);
    await expect(
      fixture([[[]]]).updateTaxonomy("brands", "missing", { active: false }),
    ).rejects.toThrow("NOT_FOUND");
  });
  it("returns filtered pages, safe integer offsets and known sort modes", async () => {
    for (const sort of ["price_asc", "price_desc", "newest"] as const) {
      expect(
        await fixture([[{ count: 1 }], [product]]).products({
          page: 2,
          pageSize: 10,
          sort,
          categoryId: "category",
          brandId: "brand",
          minPrice: 1,
          maxPrice: 200,
        }),
      ).toMatchObject({ total: 1, page: 2, pageSize: 10, items: [product] });
    }
    for (const input of [
      { page: 0 },
      { pageSize: 101 },
      { page: Infinity },
      { minPrice: 200, maxPrice: 100 },
    ])
      await expect(fixture().products(input)).rejects.toThrow("BAD_REQUEST");
    expect(await fixture([[{ id: "p" }]]).product("p")).toEqual({ id: "p" });
    await expect(fixture([[]]).product("missing")).rejects.toThrow("NOT_FOUND");
  });
  it("exposes paginated inventory and movements without changing stock", async () => {
    expect(
      await fixture([
        [{ count: 1 }],
        [{ sku: "SKU", onHand: 9, reserved: 2, available: 7 }],
      ]).inventory({ sku: "SKU", page: 1, pageSize: 20 }),
    ).toMatchObject({
      total: 1,
      items: [{ available: 7, sku: "SKU", onHand: 9, reserved: 2 }],
    });
    expect(
      await fixture([[{ count: 0 }], []]).movements("p", {
        page: 1,
        pageSize: 20,
      }),
    ).toEqual({ total: 0, items: [], page: 1, pageSize: 20 });
    expect(await fixture([[taxonomy]]).taxonomy("categories")).toEqual([
      taxonomy,
    ]);
  });
  it("adjusts stock once and rejects malformed, conflicting or unsafe reductions", async () => {
    const adjustment = {
      delta: 2,
      reason: "Initial stock",
      expectedVersion: 1,
    };
    const result = {
      productId: "p",
      onHand: 12,
      reserved: 2,
      available: 10,
      version: 2,
    };
    expect(
      await fixture([
        [],
        [],
        [{ on_hand: 10, reserved: 2, version: 1 }],
        [[result]],
        [],
        [],
        [],
        [],
      ]).adjust("p", "actor", "key", adjustment),
    ).toEqual(result);
    const hash = createHash("sha256")
      .update(JSON.stringify({ productId: "p", ...adjustment }))
      .digest("hex");
    expect(
      await fixture([[], [{ request_hash: hash, result }]]).adjust(
        "p",
        "actor",
        "key",
        adjustment,
      ),
    ).toEqual(result);
    await expect(
      fixture([[], [{ request_hash: "different", result }]]).adjust(
        "p",
        "actor",
        "key",
        adjustment,
      ),
    ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await expect(
      fixture([[], [], []]).adjust("p", "actor", "key", adjustment),
    ).rejects.toThrow("NOT_FOUND");
    await expect(
      fixture([[], [], [{ on_hand: 10, reserved: 2, version: 2 }]]).adjust(
        "p",
        "actor",
        "key",
        adjustment,
      ),
    ).rejects.toThrow("VERSION_CONFLICT");
    await expect(
      fixture([[], [], [{ on_hand: 10, reserved: 9, version: 1 }]]).adjust(
        "p",
        "actor",
        "key",
        { ...adjustment, delta: -2 },
      ),
    ).rejects.toThrow("INSUFFICIENT_STOCK");
    for (const bad of [
      { ...adjustment, delta: 0 },
      { ...adjustment, delta: 1.5 },
      { ...adjustment, reason: "x" },
    ])
      await expect(fixture().adjust("p", "actor", "key", bad)).rejects.toThrow(
        "BAD_REQUEST",
      );
  });
});
