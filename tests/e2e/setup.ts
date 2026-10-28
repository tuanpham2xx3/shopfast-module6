import { createDataSource } from "../../libs/platform/src/database/data-source";

export default async function setup() {
  const schema = process.env.E2E_SCHEMA!;
  const source = await createDataSource(
    process.env.TEST_DATABASE_URL!,
    schema,
  ).initialize();
  await source.query(`CREATE SCHEMA "${schema}"`);
  await source.runMigrations();
  await source.destroy();
  return async () => {
    const cleanup = await createDataSource(
      process.env.TEST_DATABASE_URL!,
      schema,
    ).initialize();
    await cleanup.query(`DROP SCHEMA "${schema}" CASCADE`);
    await cleanup.destroy();
  };
}
