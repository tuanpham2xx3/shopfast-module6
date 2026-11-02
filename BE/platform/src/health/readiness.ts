export async function checkReadiness(
  database: () => Promise<unknown>,
  redis: () => Promise<unknown>,
): Promise<"ok" | "degraded" | "unavailable"> {
  const [db, cache] = await Promise.allSettled([database(), redis()]);
  if (db.status === "rejected") return "unavailable";
  return cache.status === "rejected" ? "degraded" : "ok";
}
