import { MigrationInterface, QueryRunner } from "typeorm";

export class Foundation1780000000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    const schema =
      (runner.connection.options as { schema?: string }).schema ?? "public";
    await runner.query(`CREATE TABLE "${schema}".outbox_events (
      id uuid PRIMARY KEY,
      business_key text NOT NULL UNIQUE,
      type text NOT NULL,
      aggregate_id uuid NOT NULL,
      aggregate_version integer NOT NULL CHECK (aggregate_version >= 0),
      payload jsonb NOT NULL,
      available_at timestamptz NOT NULL DEFAULT now(),
      published_at timestamptz,
      lease_until timestamptz,
      lease_token uuid,
      attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await runner.query(
      `CREATE INDEX outbox_pending_idx ON "${schema}".outbox_events(available_at) WHERE published_at IS NULL`,
    );
    await runner.query(`CREATE TABLE "${schema}".job_executions (
      business_key text PRIMARY KEY,
      type text NOT NULL,
      status text NOT NULL CHECK (status IN ('PENDING', 'SUCCEEDED', 'FAILED')),
      lease_until timestamptz,
      result_ref text,
      last_error text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await runner.query(`CREATE TABLE "${schema}".fake_deliveries (
      business_key text PRIMARY KEY,
      channel text NOT NULL CHECK (channel IN ('email', 'storage', 'partner')),
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  }

  async down(runner: QueryRunner): Promise<void> {
    const schema =
      (runner.connection.options as { schema?: string }).schema ?? "public";
    await runner.query(
      `DROP TABLE "${schema}".fake_deliveries, "${schema}".job_executions, "${schema}".outbox_events`,
    );
  }
}
