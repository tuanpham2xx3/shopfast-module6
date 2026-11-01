import { createDataSource } from "../database/data-source";
import Redis from "ioredis";

export async function probeDatabase(url: string | undefined): Promise<void> {
  if (!url) throw new Error("Database is not configured");
  const source = createDataSource(url);
  try {
    await source.initialize();
    await source.query("SELECT 1");
  } finally {
    if (source.isInitialized) await source.destroy();
  }
}

export async function probeRedis(url: string | undefined): Promise<void> {
  if (!url) throw new Error("Redis is not configured");
  const redis = new Redis(url, {
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
  } finally {
    redis.disconnect();
  }
}
