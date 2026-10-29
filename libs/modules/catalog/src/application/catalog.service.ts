import { CatalogRepository } from "../persistence/catalog.repository";
import { createHash, randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import { enqueueOutbox } from "../../../../platform/src/outbox/outbox";
import {
  CatalogCache,
  catalogListKey,
  catalogListTags,
} from "../../../runtime/src/catalog-cache";
import { enqueueCatalogInvalidation } from "../../../runtime/src/catalog-invalidation";

import {
  CatalogError,
  Page,
  ProductFilter,
  ProductInput,
  Adjustment,
  Taxonomy,
} from "../catalog.contracts";
export class CatalogService {
  private readonly repository: CatalogRepository;
  constructor(
    private readonly source: DataSource,
    private readonly schema = "public",
    private readonly cache?: CatalogCache,
  ) {
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema))
      throw new Error("Invalid schema");
    this.repository = new CatalogRepository(this.source, schema);
  }
  private async invalidated<T extends object>(
    value: T,
    tags: string[],
  ): Promise<T & { cacheInvalidationPending?: boolean }> {
    const pending = this.cache ? !(await this.cache.invalidate(tags)) : false;
    return pending ? { ...value, cacheInvalidationPending: true } : value;
  }

  private page(input: Page) {
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 20;
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100 ||
      !Number.isSafeInteger((page - 1) * pageSize)
    )
      throw new CatalogError("BAD_REQUEST");
    return { page, pageSize, offset: (page - 1) * pageSize };
  }
  async taxonomy(kind: Taxonomy) {
    return this.repository.taxonomy(this.source, kind, []);
  }
  async createTaxonomy(kind: Taxonomy, input: { name: string; slug: string }) {
    const { row, tags } = await this.source.transaction(async (manager) => {
      const [row] = await this.repository.insertTaxonomy(manager, kind, [
        randomUUID(),
        input.name.trim(),
        input.slug,
      ]);
      const tags = await enqueueCatalogInvalidation(
        manager,
        this.schema,
        row.id,
        [],
        [`taxonomy:${kind}`],
      );
      return { row: row as { id: string }, tags };
    });
    return this.invalidated(row, tags);
  }
  async updateTaxonomy(
    kind: Taxonomy,
    id: string,
    input: { name?: string; active?: boolean },
  ) {
    const { row, tags } = await this.source.transaction(async (manager) => {
      const [[row]] = await this.repository.updateTaxonomy(manager, kind, [
        id,
        input.name?.trim(),
        input.active,
      ]);
      if (!row) throw new CatalogError("NOT_FOUND");
      const products: { id: string }[] = await this.repository.taxonomyProducts(
        manager,
        kind,
        [id],
      );
      const tags = await enqueueCatalogInvalidation(
        manager,
        this.schema,
        id,
        products.map((p) => p.id),
        [
          `taxonomy:${kind}`,
          `${kind === "categories" ? "category" : "brand"}:${id}`,
        ],
      );
      return { row, tags };
    });
    return this.invalidated(row, tags);
  }
  async createProduct(input: ProductInput): Promise<{ id: string }> {
    const { row, tags } = await this.source.transaction(async (manager) => {
      const [row] = await this.repository.insertProduct(manager, [
        randomUUID(),
        input.sku,
        input.slug,
        input.name,
        input.description,
        input.imageUrl,
        input.categoryId,
        input.brandId,
        input.price,
      ]);
      await this.repository.initializeInventory(manager, [row.id]);
      const tags = await enqueueCatalogInvalidation(
        manager,
        this.schema,
        row.id,
        [row.id],
      );
      return { row, tags };
    });
    return this.invalidated(row, tags);
  }
  async updateProduct(
    id: string,
    input: Partial<Omit<ProductInput, "sku">> & {
      active?: boolean;
      expectedVersion: number;
    },
  ) {
    const { row, tags } = await this.source.transaction(async (manager) => {
      const [old] = await this.repository.lockProductTaxonomy(manager, [id]);
      const [[row]] = await this.repository.updateProduct(manager, id, input);
      if (!row) throw new CatalogError("VERSION_CONFLICT");
      const tags = await enqueueCatalogInvalidation(
        manager,
        this.schema,
        id,
        [id],
        old ? [`category:${old.category_id}`, `brand:${old.brand_id}`] : [],
      );
      return { row, tags };
    });
    return this.invalidated(row, tags);
  }

  async product(id: string) {
    if (this.cache) {
      const load = async () => {
        try {
          return await this.productUncached(id);
        } catch (error) {
          if (error instanceof CatalogError && error.code === "NOT_FOUND")
            return null;
          throw error;
        }
      };
      const row = await this.cache.remember(
        `product:${id}`,
        [`product:${id}`],
        load,
        {
          validate: async (row) =>
            row
              ? this.current([row])
              : (await this.repository.activeProduct(this.source, [id]))
                  .length === 0,
        },
      );
      if (!row) throw new CatalogError("NOT_FOUND");
      return row;
    }
    return this.productUncached(id);
  }
  private async productUncached(id: string) {
    const [row] = await this.repository.activeProduct(this.source, [id]);
    if (!row) throw new CatalogError("NOT_FOUND");
    return row;
  }
  async products(input: ProductFilter) {
    if (this.cache)
      return this.cache.remember(
        catalogListKey({ ...input }),
        catalogListTags(input),
        () => this.productsUncached(input),
        {
          validate: (page) => this.current(page.items),
          tags: (page) =>
            page.items.map((p: { id: string }) => `product:${p.id}`),
        },
      );
    return this.productsUncached(input);
  }
  private async current(
    rows: {
      id: string;
      version: number;
      inventoryVersion: number;
      category: unknown;
      brand: unknown;
    }[],
  ): Promise<boolean> {
    if (!rows.length) return true;
    const latest = await this.repository.activeProducts(this.source, [
      rows.map((p) => p.id),
    ]);
    return (
      latest.length === rows.length &&
      rows.every((row) =>
        latest.some(
          (p: typeof row) =>
            p.id === row.id &&
            p.version === row.version &&
            p.inventoryVersion === row.inventoryVersion &&
            JSON.stringify(p.category) === JSON.stringify(row.category) &&
            JSON.stringify(p.brand) === JSON.stringify(row.brand),
        ),
      )
    );
  }
  private async productsUncached(input: ProductFilter) {
    const pagination = this.page(input);
    if (
      input.minPrice !== undefined &&
      input.maxPrice !== undefined &&
      input.minPrice > input.maxPrice
    )
      throw new CatalogError("BAD_REQUEST");
    return this.repository.products(input, pagination);
  }
  async inventory(input: Page & { sku?: string }) {
    return this.repository.inventory(input, this.page(input));
  }
  async adjust(
    productId: string,
    actorId: string,
    key: string,
    input: Adjustment,
  ) {
    if (
      !key ||
      key.length > 128 ||
      !Number.isInteger(input.delta) ||
      input.delta === 0 ||
      input.reason.trim().length < 5 ||
      input.reason.length > 500
    )
      throw new CatalogError("BAD_REQUEST");
    const hash = createHash("sha256")
      .update(
        JSON.stringify({
          productId,
          delta: input.delta,
          reason: input.reason,
          expectedVersion: input.expectedVersion,
        }),
      )
      .digest("hex");
    let invalidationTags: string[] = [];
    const result = await this.source.transaction(async (manager) => {
      await this.repository.lockAdjustmentKey(manager, [
        `${this.schema}:inventory:${actorId}:${key}`,
      ]);
      const [previous] = await this.repository.adjustmentByKey(manager, [
        actorId,
        key,
      ]);
      if (previous) {
        if (previous.request_hash !== hash)
          throw new CatalogError("IDEMPOTENCY_CONFLICT");
        return previous.result;
      }
      const [inventory] = await this.repository.lockInventory(manager, [
        productId,
      ]);
      if (!inventory) throw new CatalogError("NOT_FOUND");
      if (inventory.version !== input.expectedVersion)
        throw new CatalogError("VERSION_CONFLICT");
      const next = inventory.on_hand + input.delta;
      if (next < inventory.reserved || next > 2147483647)
        throw new CatalogError("INSUFFICIENT_STOCK");
      const [[result]] = await this.repository.updateInventory(manager, [
        productId,
        next,
      ]);
      await this.repository.recordAdjustment(manager, [
        randomUUID(),
        productId,
        actorId,
        key,
        hash,
        input.delta,
        input.reason,
        JSON.stringify(result),
      ]);
      await enqueueOutbox(
        manager,
        {
          id: randomUUID(),
          businessKey: `inventory-adjust:${actorId}:${key}`,
          type: "inventory.changed",
          aggregateId: productId,
          aggregateVersion: result.version,
          payload: { productId, version: result.version },
        },
        this.schema,
      );
      invalidationTags = await enqueueCatalogInvalidation(
        manager,
        this.schema,
        productId,
        [productId],
      );
      return result;
    });
    return this.invalidated(result, invalidationTags);
  }
  async movements(productId: string, input: Page) {
    const { page, pageSize, offset } = this.page(input);
    const [{ count }] = await this.repository.movementCount(this.source, [
      productId,
    ]);
    const items = await this.repository.movements(this.source, [
      productId,
      pageSize,
      offset,
    ]);
    return { items, total: count, page, pageSize };
  }
}
