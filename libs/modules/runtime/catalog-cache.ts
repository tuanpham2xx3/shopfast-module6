import { createHash, randomUUID } from "node:crypto";
import Redis from "ioredis";
import { ServiceUnavailableException } from "@nestjs/common";

export function canonicalCatalogQuery(input: Record<string, unknown>): string {
  const allowed = [
    "page",
    "pageSize",
    "sort",
    "categoryId",
    "brandId",
    "minPrice",
    "maxPrice",
  ];
  if (Object.keys(input).some((k) => !allowed.includes(k)))
    throw Error("Invalid catalog filter");
  const query = {
    page: 1,
    pageSize: 20,
    sort: "newest",
    ...Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    ),
  };
  if (
    !Number.isInteger(query.page) ||
    Number(query.page) < 1 ||
    Number(query.page) > 10000 ||
    !Number.isInteger(query.pageSize) ||
    Number(query.pageSize) < 1 ||
    Number(query.pageSize) > 100
  )
    throw Error("Invalid catalog page");
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(query).sort(([a], [b]) => a.localeCompare(b)),
    ),
  );
}
export function catalogListKey(input: Record<string, unknown>) {
  return `list:${createHash("sha256").update(canonicalCatalogQuery(input)).digest("hex")}`;
}
export function catalogListTags(input: {
  categoryId?: string;
  brandId?: string;
}) {
  return [
    ...(input.categoryId ? [`category:${input.categoryId}`] : []),
    ...(input.brandId ? [`brand:${input.brandId}`] : []),
    ...(!input.categoryId && !input.brandId ? ["lists:unfiltered"] : []),
  ];
}
const PREFIX = "catalog:";
export const CACHE_WRITE_SCRIPT = `
 for i=2,#KEYS do if (redis.call('GET',KEYS[i]) or '0') ~= ARGV[i+1] then return 0 end end
 local clock=redis.call('TIME'); local now=clock[1]*1000+math.floor(clock[2]/1000)
 redis.call('SET',KEYS[1],ARGV[1],'PX',ARGV[2])
 for i=2,#KEYS do local idx=KEYS[i]..':index'; redis.call('ZREMRANGEBYSCORE',idx,'-inf',now); redis.call('ZADD',idx,now+tonumber(ARGV[2]),KEYS[1]); local ttl=tonumber(ARGV[2])+60000; if redis.call('PTTL',idx)<ttl then redis.call('PEXPIRE',idx,ttl) end end
 return 1`;
export const CACHE_INVALIDATE_SCRIPT = `
 for i=1,#KEYS do
 redis.call('INCR',KEYS[i]); local idx=KEYS[i]..':index'; local members=redis.call('ZRANGE',idx,0,-1)
 for _,key in ipairs(members) do redis.call('DEL',key) end
 redis.call('DEL',idx)
 end
 return 1`;
export class CatalogCache {
  private readonly bypass = new Set<string>();
  private unavailableUntil = 0;
  private active = 0;
  readonly metrics = {
    hit: 0,
    miss: 0,
    error: 0,
    fallback: 0,
    contention: 0,
    invalidationError: 0,
    invalidationLatencyMs: 0,
  };
  constructor(
    private readonly redis?: Redis,
    private readonly now = () => Date.now(),
    private readonly capacity = 20,
  ) {}
  private async database<T>(load: () => Promise<T>) {
    if (this.active >= this.capacity)
      throw new ServiceUnavailableException({
        code: "CATALOG_BUSY",
        retryAfter: 1,
      });
    this.active++;
    try {
      return await load();
    } finally {
      this.active--;
    }
  }
  async remember<T>(
    key: string,
    tags: string[],
    load: () => Promise<T>,
    options: {
      ttlMs?: number;
      validate?: (value: T) => Promise<boolean>;
      tags?: (value: T) => string[];
    } = {},
  ): Promise<T> {
    const redis = this.redis;
    tags = [...new Set(tags)];
    if (
      !redis ||
      this.now() < this.unavailableUntil ||
      tags.some((t) => this.bypass.has(t))
    ) {
      this.metrics.fallback++;
      return this.database(load);
    }
    const dataKey = PREFIX + key;
    const lockKey = dataKey + ":lock";
    const owner = randomUUID();
    let locked = false;
    let loaded: { value: T } | undefined;
    let databaseError = false;
    const read = async () => {
      try {
        const value = await this.database(load);
        loaded = { value };
        return value;
      } catch (error) {
        databaseError = true;
        throw error;
      }
    };
    const validate = async (value: T) => {
      try {
        return options.validate ? await options.validate(value) : true;
      } catch (error) {
        databaseError = true;
        throw error;
      }
    };
    try {
      const cached = await redis.get(dataKey);
      if (cached !== null) {
        this.metrics.hit++;
        return JSON.parse(cached) as T;
      }
      this.metrics.miss++;
      locked = (await redis.set(lockKey, owner, "PX", 3000, "NX")) === "OK";
      if (!locked) {
        this.metrics.contention++;
        // Give the lock holder a bounded opportunity to populate the cache.
        // Poll Redis rather than sharing an old loader result across invalidation.
        for (let attempt = 0; attempt < 10; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 10));
          const filled = await redis.get(dataKey);
          if (filled !== null) {
            this.metrics.miss--;
            this.metrics.hit++;
            return JSON.parse(filled) as T;
          }
          if (tags.some((t) => this.bypass.has(t))) break;
        }
        return read();
      }
      const generations = await redis.mget(
        ...tags.map((t) => PREFIX + "generation:" + t),
      );
      let value = await read();
      if (!(await validate(value))) {
        value = await read();
        if (!(await validate(value))) return value;
      }
      const extra = (options.tags?.(value) ?? []).filter(
        (t) => !tags.includes(t),
      );
      const extraGenerations = extra.length
        ? await redis.mget(...extra.map((t) => PREFIX + "generation:" + t))
        : [];
      // Query tags cover membership changes, including empty cached results.
      const allTags = [...tags, ...extra];
      const ttl = Math.round(
        (value === null
          ? 15000
          : (options.ttlMs ?? (key.startsWith("product:") ? 300000 : 60000))) *
          (0.8 + Math.random() * 0.4),
      );
      await redis.eval(
        CACHE_WRITE_SCRIPT,
        allTags.length + 1,
        dataKey,
        ...allTags.map((t) => PREFIX + "generation:" + t),
        JSON.stringify(value),
        ttl,
        ...[...generations, ...extraGenerations].map((g) => g ?? "0"),
      );
      return value;
    } catch (error) {
      if (databaseError) throw error;
      this.metrics.error++;
      this.metrics.fallback++;
      this.unavailableUntil = this.now() + 5000;
      return loaded ? loaded.value : this.database(load);
    } finally {
      if (locked)
        try {
          await redis.eval(
            "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",
            1,
            lockKey,
            owner,
          );
        } catch {
          /* Cache is optional. */
        }
    }
  }
  async invalidate(tags: string[]): Promise<boolean> {
    const started = this.now();
    tags = [...new Set(tags)];
    for (const tag of tags) this.bypass.add(tag);
    if (!this.redis) return false;
    try {
      if (tags.length)
        await this.redis.eval(
          CACHE_INVALIDATE_SCRIPT,
          tags.length,
          ...tags.map((t) => PREFIX + "generation:" + t),
        );
      for (const tag of tags) this.bypass.delete(tag);
      return true;
    } catch {
      this.metrics.invalidationError++;
      this.unavailableUntil = this.now() + 5000;
      return false;
    } finally {
      this.metrics.invalidationLatencyMs = this.now() - started;
    }
  }
  async retryPending(): Promise<boolean> {
    return this.bypass.size ? this.invalidate([...this.bypass]) : true;
  }
}
