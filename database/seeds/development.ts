import "dotenv/config";
import { randomUUID } from "node:crypto";
import { createDataSource } from "../../libs/platform/src/database/data-source";

async function main() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Development seed is disabled in production");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const source = await createDataSource(process.env.DATABASE_URL).initialize();
  try {
    await source.query(
      `INSERT INTO outbox_events (id,business_key,type,aggregate_id,aggregate_version,payload) VALUES ($1,$2,$3,$4,1,$5) ON CONFLICT (business_key) DO NOTHING`,
      [
        randomUUID(),
        "dev-foundation-email-v1",
        "foundation.email",
        randomUUID(),
        JSON.stringify({ template: "foundation-smoke" }),
      ],
    );
    console.log("Development outbox seed ready");
  } finally {
    await source.destroy();
  }
}
void main().catch(() => {
  console.error("Seed failed; verify environment and run migrations first");
  process.exitCode = 1;
});
