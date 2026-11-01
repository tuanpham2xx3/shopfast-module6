import { DataSource, EntityManager } from "typeorm";
import type { Page, ProductFilter, ProductInput } from "../catalog.contracts";
type Taxonomy = "categories" | "brands";
type QueryExecutor = Pick<EntityManager, "query">;
interface Pagination {
  page: number;
  pageSize: number;
  offset: number;
}
/** SQL adapter. Transactional methods always use the caller's manager. */
export class CatalogRepository {
  constructor(
    private readonly source: DataSource,
    private readonly schema: string,
  ) {}
  private t(name: string) {
    return `"${this.schema}".${name}`;
  }
  private select() {
    return `SELECT p.id,p.sku,p.slug,p.name,p.description,p.image_url AS "imageUrl",p.price::float8 AS price,p.version,i.version AS "inventoryVersion",jsonb_build_object('id',c.id,'name',c.name) category,jsonb_build_object('id',b.id,'name',b.name) brand,(i.on_hand-i.reserved) available FROM ${this.t("products")} p JOIN ${this.t("categories")} c ON c.id=p.category_id JOIN ${this.t("brands")} b ON b.id=p.brand_id JOIN ${this.t("inventories")} i ON i.product_id=p.id`;
  }
  async products(input: ProductFilter, pagination: Pagination) {
    const { page, pageSize, offset } = pagination;

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
  async inventory(input: Page & { sku?: string }, pagination: Pagination) {
    const { page, pageSize, offset } = pagination;
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
  taxonomy(executor: QueryExecutor, kind: Taxonomy, values: unknown[] = []) {
    return executor.query(
      `SELECT id,name,slug,active FROM ${this.t(kind)} WHERE active ORDER BY name,id`,
      values,
    );
  }
  insertTaxonomy(
    executor: QueryExecutor,
    kind: Taxonomy,
    values: unknown[] = [],
  ) {
    return executor.query(
      `INSERT INTO ${this.t(kind)} (id,name,slug) VALUES ($1,$2,$3) RETURNING id,name,slug,active`,
      values,
    );
  }
  updateTaxonomy(
    executor: QueryExecutor,
    kind: Taxonomy,
    values: unknown[] = [],
  ) {
    return executor.query(
      `UPDATE ${this.t(kind)} SET name=COALESCE($2,name),active=COALESCE($3,active),updated_at=now() WHERE id=$1 RETURNING id,name,slug,active`,
      values,
    );
  }
  taxonomyProducts(
    executor: QueryExecutor,
    kind: Taxonomy,
    values: unknown[] = [],
  ) {
    return executor.query(
      `SELECT id FROM ${this.t("products")} WHERE ${kind === "categories" ? "category_id" : "brand_id"}=$1`,
      values,
    );
  }
  insertProduct(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `INSERT INTO ${this.t("products")} (id,sku,slug,name,description,image_url,category_id,brand_id,price) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      values,
    );
  }
  initializeInventory(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `INSERT INTO ${this.t("inventories")} (product_id) VALUES ($1)`,
      values,
    );
  }
  lockProductTaxonomy(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `SELECT category_id,brand_id FROM ${this.t("products")} WHERE id=$1 FOR UPDATE`,
      values,
    );
  }
  updateProduct(
    executor: QueryExecutor,
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
    return executor.query(
      `UPDATE ${this.t("products")} SET ${[...updates, "version=version+1", "updated_at=now()"].join(",")} WHERE id=$1 AND version=$2 RETURNING id,version`,
      values,
    );
  }
  activeProduct(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `${this.select()} WHERE p.id=$1 AND p.active AND c.active AND b.active`,
      values,
    );
  }
  activeProducts(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `${this.select()} WHERE p.id=ANY($1::uuid[]) AND p.active AND c.active AND b.active`,
      values,
    );
  }
  lockAdjustmentKey(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,
      values,
    );
  }
  adjustmentByKey(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `SELECT request_hash,result FROM ${this.t("inventory_adjustments")} WHERE actor_id=$1 AND idempotency_key=$2`,
      values,
    );
  }
  lockInventory(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `SELECT * FROM ${this.t("inventories")} WHERE product_id=$1 FOR UPDATE`,
      values,
    );
  }
  updateInventory(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `UPDATE ${this.t("inventories")} SET on_hand=$2,version=version+1 WHERE product_id=$1 RETURNING product_id AS "productId",on_hand AS "onHand",reserved,on_hand-reserved available,version`,
      values,
    );
  }
  recordAdjustment(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `INSERT INTO ${this.t("inventory_adjustments")} (id,product_id,actor_id,idempotency_key,request_hash,delta,reason,result) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      values,
    );
  }
  movementCount(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `SELECT count(*)::int count FROM ${this.t("inventory_adjustments")} WHERE product_id=$1`,
      values,
    );
  }
  movements(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `SELECT id,delta,reason,actor_id AS "actorId",created_at AS "createdAt" FROM ${this.t("inventory_adjustments")} WHERE product_id=$1 ORDER BY created_at DESC,id LIMIT $2 OFFSET $3`,
      values,
    );
  }
}
