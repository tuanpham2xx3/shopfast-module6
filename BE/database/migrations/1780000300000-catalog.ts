import { MigrationInterface, QueryRunner } from "typeorm";

export class Catalog1780000300000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    const schema =
      (runner.connection.options as { schema?: string }).schema ?? "public";
    const t = (name: string) => `"${schema}".${name}`;
    for (const name of ["categories", "brands"]) {
      await runner.query(
        `CREATE TABLE ${t(name)} (id uuid PRIMARY KEY, name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100), slug text NOT NULL UNIQUE, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`,
      );
    }
    await runner.query(
      `CREATE TABLE ${t("products")} (id uuid PRIMARY KEY, sku text NOT NULL UNIQUE, slug text NOT NULL UNIQUE, name text NOT NULL, description text NOT NULL, image_url text NOT NULL, category_id uuid NOT NULL REFERENCES ${t("categories")}(id), brand_id uuid NOT NULL REFERENCES ${t("brands")}(id), price bigint NOT NULL CHECK(price BETWEEN 0 AND 9007199254740991), active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1 CHECK(version>0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`,
    );
    await runner.query(
      `CREATE INDEX products_category_idx ON ${t("products")}(active,category_id,price,id)`,
    );
    await runner.query(
      `CREATE INDEX products_brand_idx ON ${t("products")}(active,brand_id,price,id)`,
    );
    await runner.query(
      `CREATE TABLE ${t("inventories")} (product_id uuid PRIMARY KEY REFERENCES ${t("products")}(id), on_hand integer NOT NULL DEFAULT 0, reserved integer NOT NULL DEFAULT 0, version integer NOT NULL DEFAULT 1 CHECK(version>0), CHECK(reserved>=0 AND on_hand>=reserved))`,
    );
    await runner.query(
      `CREATE TABLE ${t("inventory_adjustments")} (id uuid PRIMARY KEY, product_id uuid NOT NULL REFERENCES ${t("products")}(id), actor_id uuid NOT NULL, idempotency_key text NOT NULL, request_hash text NOT NULL, delta integer NOT NULL CHECK(delta<>0), reason text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(actor_id,idempotency_key))`,
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    const schema =
      (runner.connection.options as { schema?: string }).schema ?? "public";
    for (const name of [
      "inventory_adjustments",
      "inventories",
      "products",
      "brands",
      "categories",
    ])
      await runner.query(`DROP TABLE "${schema}".${name}`);
  }
}
