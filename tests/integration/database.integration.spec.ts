import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import { createDataSource } from "../../libs/platform/src/database/data-source";

describe("PostgreSQL migration contract", () => {
  let source: DataSource;
  const schema = `test_${randomUUID().replace(/-/g, "")}`;
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL)
      throw new Error("TEST_DATABASE_URL is required for integration tests");
    source = await createDataSource(
      process.env.TEST_DATABASE_URL,
      schema,
    ).initialize();
    await source.query(`CREATE SCHEMA "${schema}"`);
  });
  afterAll(async () => {
    if (source?.isInitialized) {
      await source.query(`DROP SCHEMA "${schema}" CASCADE`);
      await source.destroy();
    }
  });
  it("migrates an empty isolated schema and safely reruns", async () => {
    expect(await source.runMigrations()).toHaveLength(1);
    expect(await source.runMigrations()).toHaveLength(0);
    const tables = await source.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema=$1`,
      [schema],
    );
    expect(tables.map((row: { table_name: string }) => row.table_name)).toEqual(
      expect.arrayContaining([
        "outbox_events",
        "job_executions",
        "fake_deliveries",
      ]),
    );
  });
});
