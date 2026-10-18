import "dotenv/config";
import Redis from "ioredis";
import { parseEnvironment } from "../libs/platform/src/config/environment";
import { createDataSource } from "../libs/platform/src/database/data-source";

async function main() {
  parseEnvironment(process.env);
  console.log(`Node: ${process.version}`);
  let failures = 0;
  if (Number(process.versions.node.split(".")[0]) !== 20) {
    console.error("FAIL: Node 20 is required by SRS");
    failures++;
  }
  if (!process.env.DATABASE_URL) {
    console.error("FAIL: DATABASE_URL is not set");
    failures++;
  } else {
    const source = createDataSource(process.env.DATABASE_URL);
    try {
      await source.initialize();
      const [version] = await source.query("SHOW server_version_num");
      if (Math.floor(Number(version.server_version_num) / 10000) !== 16)
        throw new Error("Expected PostgreSQL 16");
      console.log("PASS: PostgreSQL 16 connectivity");
      if (await source.showMigrations()) {
        console.error("FAIL: pending migrations; run npm run db:migrate");
        failures++;
      }
    } catch {
      console.error("FAIL: PostgreSQL connectivity/version");
      failures++;
    } finally {
      if (source.isInitialized) await source.destroy();
    }
  }
  if (!process.env.REDIS_URL) {
    console.error("FAIL: REDIS_URL is not set");
    failures++;
  } else {
    const redis = new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      connectTimeout: 2000,
      commandTimeout: 2000,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });
    redis.on("error", () => undefined);
    try {
      await redis.connect();
      await redis.ping();
      const info = await redis.info("server");
      if (!/^redis_version:7\./m.test(info))
        throw new Error("Expected Redis API 7");
      console.log(
        "PASS: Redis API 7 connectivity; run integration tests for Lua/PubSub/BullMQ contract",
      );
    } catch {
      console.error("FAIL: Redis API 7 connectivity/version");
      failures++;
    } finally {
      redis.disconnect();
    }
  }
  process.exitCode = failures ? 1 : 0;
}
void main().catch(() => {
  console.error("FAIL: invalid environment configuration");
  process.exitCode = 1;
});
