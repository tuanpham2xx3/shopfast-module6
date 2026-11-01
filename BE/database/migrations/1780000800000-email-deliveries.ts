import { MigrationInterface, QueryRunner } from "typeorm";
export class EmailDeliveries1780000800000 implements MigrationInterface {
  async up(r: QueryRunner) {
    const s = (r.connection.options as { schema?: string }).schema ?? "public";
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(s)) throw new Error("Invalid schema");
    await r.query(
      `CREATE TABLE "${s}".email_deliveries (business_key text PRIMARY KEY,body jsonb NOT NULL,provider_id text,first_attempt_at timestamptz NOT NULL DEFAULT now(),sent_at timestamptz)`,
    );
  }
  async down(r: QueryRunner) {
    const s = (r.connection.options as { schema?: string }).schema ?? "public";
    await r.query(`DROP TABLE "${s}".email_deliveries`);
  }
}
