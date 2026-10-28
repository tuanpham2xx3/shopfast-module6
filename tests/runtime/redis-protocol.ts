import {
  CACHE_INVALIDATE_SCRIPT,
  CACHE_WRITE_SCRIPT,
} from "../../libs/modules/runtime/catalog-cache";
/** Deterministic Redis protocol double; live Lua execution remains a separate acceptance check. */
export class RedisProtocol {
  readonly data = new Map<string, string>();
  readonly generations = new Map<string, string>();
  readonly indexes = new Map<string, Set<string>>();
  offline = false;
  async get(key: string) {
    if (this.offline) throw Error("offline");
    return this.data.get(key) ?? null;
  }
  async set(key: string, value: string) {
    if (this.offline) throw Error("offline");
    if (this.data.has(key)) return null;
    this.data.set(key, value);
    return "OK";
  }
  async mget(...keys: string[]) {
    if (this.offline) throw Error("offline");
    return keys.map((k) => this.generations.get(k) ?? null);
  }
  async eval(script: string, count: number, ...args: (string | number)[]) {
    if (this.offline) throw Error("offline");
    const keys = args.slice(0, count).map(String);
    const values = args.slice(count).map(String);
    if (script === CACHE_WRITE_SCRIPT) {
      if (
        keys
          .slice(1)
          .some(
            (key, i) => (this.generations.get(key) ?? "0") !== values[i + 2],
          )
      )
        return 0;
      this.data.set(keys[0]!, values[0]!);
      for (const tag of keys.slice(1)) {
        const index = this.indexes.get(tag) ?? new Set();
        index.add(keys[0]!);
        this.indexes.set(tag, index);
      }
      return 1;
    }
    if (script === CACHE_INVALIDATE_SCRIPT) {
      for (const tag of keys) {
        this.generations.set(
          tag,
          String(Number(this.generations.get(tag) ?? "0") + 1),
        );
        for (const key of this.indexes.get(tag) ?? []) this.data.delete(key);
        this.indexes.delete(tag);
      }
      return 1;
    }
    if (this.data.get(keys[0]!) === values[0]) this.data.delete(keys[0]!);
    return 1;
  }
}
