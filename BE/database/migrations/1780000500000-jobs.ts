import { MigrationInterface, QueryRunner } from "typeorm";
export class Jobs1780000500000 implements MigrationInterface {
  async up(r: QueryRunner) {
    const s = (r.connection.options as { schema?: string }).schema ?? "public";
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(s)) throw new Error("Invalid schema");
    const t = (n: string) => `"${s}".${n}`;
    await r.query(
      `ALTER TABLE ${t("job_executions")} ADD COLUMN lease_token uuid, ADD COLUMN attempts integer NOT NULL DEFAULT 0, ADD COLUMN max_attempts integer NOT NULL DEFAULT 5, ADD COLUMN available_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN payload jsonb NOT NULL DEFAULT '{}'`,
    );
    await r.query(
      `CREATE TABLE ${t("failed_jobs")} (id uuid PRIMARY KEY,business_key text NOT NULL REFERENCES ${t("job_executions")}(business_key),reason text NOT NULL,attempt integer NOT NULL,UNIQUE(business_key,attempt),created_at timestamptz NOT NULL DEFAULT now())`,
    );
    await r.query(
      `CREATE TABLE ${t("job_retry_audit")} (id uuid PRIMARY KEY,failed_job_id uuid NOT NULL REFERENCES ${t("failed_jobs")}(id),actor_id uuid NOT NULL REFERENCES ${t("users")}(id),created_at timestamptz NOT NULL DEFAULT now())`,
    );
    await r.query(
      `CREATE TABLE ${t("invoices")} (order_id uuid PRIMARY KEY REFERENCES ${t("orders")}(id),version integer NOT NULL DEFAULT 1,content bytea NOT NULL,checksum text NOT NULL,created_at timestamptz NOT NULL DEFAULT now())`,
    );
    await r.query(
      `CREATE TABLE ${t("partner_inventory")} (product_id uuid PRIMARY KEY REFERENCES ${t("products")}(id),version integer NOT NULL,available integer NOT NULL,updated_at timestamptz NOT NULL DEFAULT now())`,
    );
    await r.query(
      `CREATE TABLE ${t("revenue_reports")} (business_date date PRIMARY KEY,total numeric NOT NULL,order_count integer NOT NULL,csv text NOT NULL,created_at timestamptz NOT NULL DEFAULT now())`,
    );
  }
  async down(r: QueryRunner) {
    const s = (r.connection.options as { schema?: string }).schema ?? "public";
    for (const n of [
      "revenue_reports",
      "partner_inventory",
      "invoices",
      "job_retry_audit",
      "failed_jobs",
    ])
      await r.query(`DROP TABLE "${s}".${n}`);
    await r.query(
      `ALTER TABLE "${s}".job_executions DROP COLUMN lease_token,DROP COLUMN attempts,DROP COLUMN max_attempts,DROP COLUMN available_at,DROP COLUMN payload`,
    );
  }
}
