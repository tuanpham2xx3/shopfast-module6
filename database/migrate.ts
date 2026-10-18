import "dotenv/config";
import { createDataSource } from "../libs/platform/src/database/data-source";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const source = createDataSource(process.env.DATABASE_URL);
  await source.initialize();
  try {
    const migrations = await source.runMigrations();
    console.log(`Applied ${migrations.length} migrations`);
  } finally {
    await source.destroy();
  }
}
void main().catch(() => {
  console.error(
    "Migration failed; check DATABASE_URL and database permissions",
  );
  process.exitCode = 1;
});
