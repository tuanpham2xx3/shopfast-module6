import { MigrationInterface, QueryRunner } from "typeorm";

export class SecurityCounters1780000200000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    const schema =
      (runner.connection.options as { schema?: string }).schema ?? "public";
    await runner.query(
      `CREATE TABLE "${schema}".security_counters (scope text NOT NULL, subject_hash text NOT NULL, window_start timestamptz NOT NULL DEFAULT clock_timestamp(), count integer NOT NULL CHECK (count > 0), blocked_until timestamptz, PRIMARY KEY(scope,subject_hash,window_start))`,
    );
    await runner.query(
      `CREATE INDEX security_counters_expiry_idx ON "${schema}".security_counters(window_start)`,
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    const schema =
      (runner.connection.options as { schema?: string }).schema ?? "public";
    await runner.query(`DROP TABLE "${schema}".security_counters`);
  }
}
