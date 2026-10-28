import { RedisProtocol } from "./redis-protocol";
import Redis from "ioredis";
import { CatalogCache } from "../../libs/modules/runtime/src/catalog-cache";

function setup() {
  const redis = new RedisProtocol();
  const cache = new CatalogCache(redis as unknown as Redis);
  return { redis, cache };
}
describe("catalog cache race and outage behavior", () => {
  it("coalesces a hot miss instead of sending every waiter to the database", async () => {
    jest.useFakeTimers();
    try {
      const { cache } = setup();
      const load = jest.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 25));
        return { price: 100 };
      });
      const reads = Array.from({ length: 10 }, () =>
        cache.remember("product:hot", ["product:hot"], load),
      );
      await jest.advanceTimersByTimeAsync(150);
      expect(await Promise.all(reads)).toEqual(
        Array.from({ length: 10 }, () => ({ price: 100 })),
      );
      expect(load).toHaveBeenCalledTimes(1);
      expect(cache.metrics).toMatchObject({ hit: 9, miss: 1 });
    } finally {
      jest.useRealTimers();
    }
  });
  it("does not repopulate stale values after concurrent mutation invalidation", async () => {
    const { cache, redis } = setup();
    let release!: (value: { price: number }) => void;
    const waiting = new Promise<{ price: number }>((resolve) => {
      release = resolve;
    });
    const old = cache.remember("product:p", ["product:p"], () => waiting);
    // Wait until loader has begun, without timing-dependent sleeps.
    for (let i = 0; i < 10; i++) await Promise.resolve();
    await cache.invalidate(["product:p"]);
    release({ price: 10 });
    await old;
    expect(redis.data.has("catalog:product:p")).toBe(false);
    expect(
      await cache.remember("product:p", ["product:p"], async () => ({
        price: 20,
      })),
    ).toEqual({ price: 20 });
  });
  it("invalidates empty list membership but retains unrelated category caches", async () => {
    const { cache, redis } = setup();
    await cache.remember("list:a", ["category:a"], async () => []);
    await cache.remember("list:b", ["category:b"], async () => [{ id: "b" }]);
    await cache.invalidate(["category:a"]);
    expect(redis.data.has("catalog:list:a")).toBe(false);
    expect(redis.data.has("catalog:list:b")).toBe(true);
  });
  it("bypasses stale data after an invalidation outage until a successful retry", async () => {
    const { cache, redis } = setup();
    await cache.remember("product:p", ["product:p"], async () => ({
      price: 10,
    }));
    redis.offline = true;
    expect(await cache.invalidate(["product:p"])).toBe(false);
    redis.offline = false;
    expect(
      await cache.remember("product:p", ["product:p"], async () => ({
        price: 20,
      })),
    ).toEqual({ price: 20 });
    expect(await cache.invalidate(["product:p"])).toBe(true);
  });
  it("revalidates a raced DB version and does not hide database errors", async () => {
    const { cache } = setup();
    let version = 0;
    const load = async () => ({ version: ++version });
    const value = await cache.remember("product:p", ["product:p"], load, {
      validate: async (row) => row.version === 2,
    });
    expect(value.version).toBe(2);
    const fail = jest.fn(async () => {
      throw Error("DB unavailable");
    });
    await expect(
      cache.remember("product:bad", ["product:bad"], fail),
    ).rejects.toThrow("DB unavailable");
    expect(fail).toHaveBeenCalledTimes(1);
  });
  it("limits DB fallback concurrency", async () => {
    const cache = new CatalogCache(undefined, () => 0, 1);
    let release!: (v: number) => void;
    const first = cache.remember(
      "a",
      [],
      () =>
        new Promise<number>((resolve) => {
          release = resolve;
        }),
    );
    await expect(cache.remember("b", [], async () => 2)).rejects.toMatchObject({
      status: 503,
    });
    release(1);
    await first;
  });
});
