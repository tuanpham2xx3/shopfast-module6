import { createHash, randomUUID } from "node:crypto";
import { HttpException, ServiceUnavailableException } from "@nestjs/common";
import Redis from "ioredis";
import { DataSource } from "typeorm";
export function subjectHash(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}
export class RateLimitError extends HttpException {
  constructor(public readonly retryAfter: number) {
    super(
      {
        code: "RATE_LIMITED",
        message: `B\u1ea1n thao t\u00e1c qu\u00e1 nhanh. Vui l\u00f2ng th\u1eed l\u1ea1i sau ${retryAfter} gi\u00e2y.`,
        retryAfter,
      },
      429,
    );
  }
}
export class SlidingWindow {
  private readonly entries = new Map<string, number[]>();
  constructor(private readonly now = () => Date.now()) {}
  consume(key: string, limit: number, windowMs: number): number {
    const now = this.now();
    if (!this.entries.has(key) && this.entries.size >= 10000) {
      for (const [id, list] of this.entries)
        if ((list.at(-1) ?? 0) <= now - windowMs) this.entries.delete(id);
      if (this.entries.size >= 10000)
        return Math.max(1, Math.ceil(windowMs / 1000));
    }
    const times = (this.entries.get(key) ?? []).filter(
      (t) => t > now - windowMs,
    );
    if (times.length >= limit) {
      this.entries.set(key, times);
      return Math.max(
        1,
        Math.ceil(((times[0] ?? now) + windowMs - now) / 1000),
      );
    }
    times.push(now);
    this.entries.set(key, times);
    if (this.entries.size > 10000)
      for (const [id, list] of this.entries)
        if ((list.at(-1) ?? 0) <= now - windowMs) this.entries.delete(id);
    return 0;
  }
}
export const LIMIT_SCRIPT = `
 local now=redis.call('TIME'); local ms=now[1]*1000+math.floor(now[2]/1000)
 redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',ms-tonumber(ARGV[1]))
 if redis.call('ZCARD',KEYS[1])>=tonumber(ARGV[2]) then local first=redis.call('ZRANGE',KEYS[1],0,0,'WITHSCORES'); return math.max(1,math.ceil((tonumber(first[2])+tonumber(ARGV[1])-ms)/1000)) end
 redis.call('ZADD',KEYS[1],ms,ARGV[3]); redis.call('PEXPIRE',KEYS[1],ARGV[1]); return 0`;
export class RuntimeLimiter {
  private readonly fallback = new SlidingWindow();
  private readonly table: string;
  degraded = false;
  constructor(
    private readonly source: DataSource,
    private readonly redis?: Redis,
    schema = "public",
  ) {
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw Error("Invalid schema");
    this.table = `"${schema}".security_counters`;
  }
  async consume(
    scope: string,
    subject: string,
    limit: number,
    windowMs: number,
    sensitive = false,
  ) {
    const hash = subjectHash(subject);
    let retry: number;
    if (sensitive) {
      try {
        retry = await this.source.transaction(async (manager) => {
          await manager.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            [`runtime:${scope}:${hash}`],
          );
          const [row] = await manager.query(
            `SELECT COALESCE(sum(count),0)::int count, GREATEST(1,ceil(extract(epoch FROM min(window_start)+($3::bigint * interval '1 millisecond')-clock_timestamp())))::int retry FROM ${this.table} WHERE scope=$1 AND subject_hash=$2 AND window_start>clock_timestamp()-($3::bigint * interval '1 millisecond')`,
            [scope, hash, windowMs],
          );
          if (row.count >= limit) return Number(row.retry);
          await manager.query(
            `INSERT INTO ${this.table}(scope,subject_hash,count) VALUES ($1,$2,1)`,
            [scope, hash],
          );
          return 0;
        });
      } catch {
        throw new ServiceUnavailableException({
          code: "LIMITER_UNAVAILABLE",
          retryAfter: 5,
        });
      }
    } else {
      try {
        if (!this.redis) throw Error("Redis unavailable");
        retry = Number(
          await this.redis.eval(
            LIMIT_SCRIPT,
            1,
            `limiter:${scope}:${hash}`,
            windowMs,
            limit,
            randomUUID(),
          ),
        );
        this.degraded = false;
      } catch {
        this.degraded = true;
        retry = this.fallback.consume(
          `${scope}:${hash}`,
          Math.max(1, Math.floor(limit / 2)),
          windowMs,
        );
      }
    }
    if (retry) throw new RateLimitError(retry);
  }
  async loginTarget(email: string, action: "check" | "failure" | "reset") {
    const hash = subjectHash(email);
    try {
      return await this.source.transaction(async (manager) => {
        await manager.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [`runtime:login-target:${hash}`],
        );
        if (action === "reset") {
          await manager.query(
            `DELETE FROM ${this.table} WHERE scope='login-target' AND subject_hash=$1`,
            [hash],
          );
          return;
        }
        const [row] = await manager.query(
          `SELECT COALESCE(sum(count),0)::int count,GREATEST(0,ceil(extract(epoch FROM max(blocked_until)-clock_timestamp())))::int retry FROM ${this.table} WHERE scope='login-target' AND subject_hash=$1 AND window_start>clock_timestamp()-interval '30 minutes'`,
          [hash],
        );
        if (action === "check") {
          if (row.retry > 0) throw new RateLimitError(row.retry);
          return;
        }
        const count = Number(row.count) + 1;
        const delay =
          count >= 15 ? 1800 : count >= 10 ? 300 : count >= 5 ? 60 : 0;
        await manager.query(
          `INSERT INTO ${this.table}(scope,subject_hash,count,blocked_until) VALUES ('login-target',$1,1,clock_timestamp()+($2::int * interval '1 second'))`,
          [hash, delay],
        );
      });
    } catch (error) {
      if (error instanceof RateLimitError) throw error;
      throw new ServiceUnavailableException({
        code: "LIMITER_UNAVAILABLE",
        retryAfter: 5,
      });
    }
  }
  async cleanup() {
    await this.source.query(
      `DELETE FROM ${this.table} WHERE window_start<clock_timestamp()-interval '1 day' AND (blocked_until IS NULL OR blocked_until<clock_timestamp())`,
    );
  }
}
