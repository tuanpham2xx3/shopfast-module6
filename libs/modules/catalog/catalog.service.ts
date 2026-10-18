import { createHash, randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import { enqueueOutbox } from "../../platform/src/outbox/outbox";

export class CatalogError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
type Taxonomy = "categories" | "brands";
export interface Page {
  page?: number;
  pageSize?: number;
}
export interface ProductFilter extends Page {
  categoryId?: string;
  brandId?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: "newest" | "price_asc" | "price_desc";
}
export interface ProductInput {
  sku: string;
  slug: string;
  name: string;
  description: string;
  imageUrl: string;
  categoryId: string;
  brandId: string;
  price: number;
}
export interface Adjustment {
  delta: number;
  reason: string;
  expectedVersion: number;
}

export class CatalogService {
  constructor(
    private readonly source: DataSource,
    private readonly schema = "public",
  ) {
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema))
      throw new Error("Invalid schema");
  }
  private t(name: string) {
    return `"${this.schema}".${name}`;
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
    return this.source.query(
      `SELECT id,name,slug,active FROM ${this.t(kind)} WHERE active ORDER BY name,id`,
    );
  }
  async createTaxonomy(kind: Taxonomy, input: { name: string; slug: string }) {
    const [row] = await this.source.query(
      `INSERT INTO ${this.t(kind)} (id,name,slug) VALUES ($1,$2,$3) RETURNING id,name,slug,active`,
      [randomUUID(), input.name.trim(), input.slug],
    );
    return row as { id: string };
  }
  async updateTaxonomy(
    kind: Taxonomy,
    id: string,
    input: { name?: string; active?: boolean },
  ) {
    const [[row]] = await this.source.query(
      `UPDATE ${this.t(kind)} SET name=COALESCE($2,name),active=COALESCE($3,active),updated_at=now() WHERE id=$1 RETURNING id,name,slug,active`,
      [id, input.name?.trim(), input.active],
    );
    if (!row) throw new CatalogError("NOT_FOUND");
    return row;
  }
  async createProduct(input: ProductInput): Promise<{ id: string }> {
    return this.source.transaction(async (manager) => {
      const [row] = await manager.query(
        `INSERT INTO ${this.t("products")} (id,sku,slug,name,description,image_url,category_id,brand_id,price) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [
          randomUUID(),
          input.sku,
          input.slug,
          input.name,
          input.description,
          input.imageUrl,
          input.categoryId,
          input.brandId,
          input.price,
        ],
      );
      await manager.query(
        `INSERT INTO ${this.t("inventories")} (product_id) VALUES ($1)`,
        [row.id],
      );
      return row;
    });
  }
  async updateProduct(
    id: string,
    input: Partial<Omit<ProductInput, "sku">> & {
      active?: boolean;
      expectedVersion: number;
    },
  ) {
    const fields: Record<string, string> = {
      slug: "slug",
      name: "name",
      description: "description",
      imageUrl: "image_url",
      categoryId: "category_id",
      brandId: "brand_id",
      price: "price",
      active: "active",
    };
    const values: unknown[] = [id, input.expectedVersion];
    const updates: string[] = [];
    for (const [key, column] of Object.entries(fields))
      if (input[key as keyof typeof input] !== undefined) {
        values.push(input[key as keyof typeof input]);
        updates.push(`${column}=$${values.length}`);
      }
    const [[row]] = await this.source.query(
      `UPDATE ${this.t("products")} SET ${[...updates, "version=version+1", "updated_at=now()"].join(",")} WHERE id=$1 AND version=$2 RETURNING id,version`,
      values,
    );
    if (!row) throw new CatalogError("VERSION_CONFLICT");
    return row;
  }
  private select() {
    return `SELECT p.id,p.sku,p.slug,p.name,p.description,p.image_url AS "imageUrl",p.price::float8 AS price,p.version,jsonb_build_object('id',c.id,'name',c.name) category,jsonb_build_object('id',b.id,'name',b.name) brand,(i.on_hand-i.reserved) available FROM ${this.t("products")} p JOIN ${this.t("categories")} c ON c.id=p.category_id JOIN ${this.t("brands")} b ON b.id=p.brand_id JOIN ${this.t("inventories")} i ON i.product_id=p.id`;
  }
  async product(id: string) {
    const [row] = await this.source.query(
      `${this.select()} WHERE p.id=$1 AND p.active AND c.active AND b.active`,
      [id],
    );
    if (!row) throw new CatalogError("NOT_FOUND");
    return row;
  }
  async products(input: ProductFilter) {
    const { page, pageSize, offset } = this.page(input);
    if (
      input.minPrice !== undefined &&
      input.maxPrice !== undefined &&
      input.minPrice > input.maxPrice
    )
      throw new CatalogError("BAD_REQUEST");
    const values: unknown[] = [];
    const filters = ["p.active", "c.active", "b.active"];
    for (const [value, column, op] of [
      [input.categoryId, "p.category_id", "="],
      [input.brandId, "p.brand_id", "="],
      [input.minPrice, "p.price", ">="],
      [input.maxPrice, "p.price", "<="],
    ] as const)
      if (value !== undefined) {
        values.push(value);
        filters.push(`${column}${op}$${values.length}`);
      }
    const order =
      input.sort === "price_asc"
        ? "p.price ASC,p.id"
        : input.sort === "price_desc"
          ? "p.price DESC,p.id"
          : "p.created_at DESC,p.id";
    const query = `${this.select()} WHERE ${filters.join(" AND ")}`;
    const [{ count }] = await this.source.query(
      `SELECT count(*)::int count FROM (${query}) results`,
      values,
    );
    const items = await this.source.query(
      `${query} ORDER BY ${order} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset],
    );
    return { items, total: count, page, pageSize };
  }
  async inventory(input: Page & { sku?: string }) {
    const { page, pageSize, offset } = this.page(input);
    const where = input.sku ? "WHERE p.sku=$1" : "";
    const values = input.sku ? [input.sku] : [];
    const base = `FROM ${this.t("inventories")} i JOIN ${this.t("products")} p ON p.id=i.product_id ${where}`;
    const [{ count }] = await this.source.query(
      `SELECT count(*)::int count ${base}`,
      values,
    );
    const items = await this.source.query(
      `SELECT p.id AS "productId",p.sku,p.name,i.on_hand AS "onHand",i.reserved,i.on_hand-i.reserved available,i.version ${base} ORDER BY p.sku LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset],
    );
    return { items, total: count, page, pageSize };
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
    return this.source.transaction(async (manager) => {
      await manager.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,
        [`${this.schema}:inventory:${actorId}:${key}`],
      );
      const [previous] = await manager.query(
        `SELECT request_hash,result FROM ${this.t("inventory_adjustments")} WHERE actor_id=$1 AND idempotency_key=$2`,
        [actorId, key],
      );
      if (previous) {
        if (previous.request_hash !== hash)
          throw new CatalogError("IDEMPOTENCY_CONFLICT");
        return previous.result;
      }
      const [inventory] = await manager.query(
        `SELECT * FROM ${this.t("inventories")} WHERE product_id=$1 FOR UPDATE`,
        [productId],
      );
      if (!inventory) throw new CatalogError("NOT_FOUND");
      if (inventory.version !== input.expectedVersion)
        throw new CatalogError("VERSION_CONFLICT");
      const next = inventory.on_hand + input.delta;
      if (next < inventory.reserved || next > 2147483647)
        throw new CatalogError("INSUFFICIENT_STOCK");
      const [[result]] = await manager.query(
        `UPDATE ${this.t("inventories")} SET on_hand=$2,version=version+1 WHERE product_id=$1 RETURNING product_id AS "productId",on_hand AS "onHand",reserved,on_hand-reserved available,version`,
        [productId, next],
      );
      await manager.query(
        `INSERT INTO ${this.t("inventory_adjustments")} (id,product_id,actor_id,idempotency_key,request_hash,delta,reason,result) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          randomUUID(),
          productId,
          actorId,
          key,
          hash,
          input.delta,
          input.reason,
          JSON.stringify(result),
        ],
      );
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
      return result;
    });
  }
  async movements(productId: string, input: Page) {
    const { page, pageSize, offset } = this.page(input);
    const [{ count }] = await this.source.query(
      `SELECT count(*)::int count FROM ${this.t("inventory_adjustments")} WHERE product_id=$1`,
      [productId],
    );
    const items = await this.source.query(
      `SELECT id,delta,reason,actor_id AS "actorId",created_at AS "createdAt" FROM ${this.t("inventory_adjustments")} WHERE product_id=$1 ORDER BY created_at DESC,id LIMIT $2 OFFSET $3`,
      [productId, pageSize, offset],
    );
    return { items, total: count, page, pageSize };
  }
}
