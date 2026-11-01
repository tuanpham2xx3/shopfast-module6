import { randomUUID } from "node:crypto";
import { Queue, QueueEvents, Worker } from "bullmq";
import Redis from "ioredis";

describe("Redis/BullMQ native compatibility", () => {
  let redis: Redis;
  let subscriber: Redis;
  beforeAll(async () => {
    if (!process.env.TEST_REDIS_URL)
      throw new Error("TEST_REDIS_URL is required");
    redis = new Redis(process.env.TEST_REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      retryStrategy: () => null,
    });
    subscriber = redis.duplicate();
    redis.on("error", () => undefined);
    subscriber.on("error", () => undefined);
    await redis.connect();
  });
  afterAll(() => {
    subscriber?.disconnect();
    redis?.disconnect();
  });

  it("supports expiring counters, Lua and Pub/Sub", async () => {
    const key = `shopfast-test-${randomUUID()}`;
    try {
      expect(await redis.set(key, "1", "EX", 30, "NX")).toBe("OK");
      expect(await redis.incr(key)).toBe(2);
      expect(
        await redis.eval('return redis.call("GET", KEYS[1])', 1, key),
      ).toBe("2");
      await subscriber.connect();
      const message = new Promise((resolve) =>
        subscriber.once("message", (_channel, value) => resolve(value)),
      );
      await subscriber.subscribe(key);
      await redis.publish(key, "hello");
      await expect(message).resolves.toBe("hello");
    } finally {
      await redis.del(key);
      await subscriber.unsubscribe(key);
    }
  });

  it("processes delayed jobs and retries a failed attempt", async () => {
    const name = `shopfast-test-${randomUUID()}`;
    const queue = new Queue(name, { connection: redis });
    const events = new QueueEvents(name, { connection: redis });
    const worker = new Worker(
      name,
      async (job) => {
        if (job.attemptsMade === 0) throw new Error("expected retry");
        return "done";
      },
      { connection: redis },
    );
    try {
      await events.waitUntilReady();
      const start = Date.now();
      const job = await queue.add(
        "retry",
        {},
        { delay: 150, attempts: 2, backoff: { type: "fixed", delay: 50 } },
      );
      expect(await job.waitUntilFinished(events, 10000)).toBe("done");
      expect(Date.now() - start).toBeGreaterThanOrEqual(140);
      expect((await queue.getJob(job.id!))?.attemptsMade).toBe(2);
    } finally {
      await worker.close();
      await events.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });
});
