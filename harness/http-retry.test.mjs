import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { fetchRespectingRateLimit } from "./http-retry.mjs";
test("actual HTTP 429 honors Retry-After before a successful retry", async () => {
  let calls = 0;
  const server = createServer((request, response) => {
    request.resume();
    if (++calls === 1) {
      response.writeHead(429, { "Retry-After": "1" });
      response.end("limited");
    } else {
      response.writeHead(200);
      response.end("ok");
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const started = Date.now();
    const response = await fetchRespectingRateLimit(() =>
      fetch(`http://127.0.0.1:${server.address().port}`),
    );
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "ok");
    assert.equal(calls, 2);
    assert(Date.now() - started >= 1000);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
test("401 is never retried and exhausted 429 does not become PASS", async () => {
  let calls = 0;
  const noRetry = await fetchRespectingRateLimit(async () => {
    calls++;
    return new Response("", { status: 401 });
  });
  assert.equal(noRetry.status, 401);
  assert.equal(calls, 1);
  const waits = [];
  calls = 0;
  const exhausted = await fetchRespectingRateLimit(
    async () => {
      calls++;
      return new Response("", { status: 429, headers: { "Retry-After": "1" } });
    },
    { wait: async (ms) => waits.push(ms) },
  );
  assert.equal(exhausted.status, 429);
  assert.equal(calls, 3);
  assert.deepEqual(waits, [1100, 1100]);
});
test("an excessive Retry-After stops without bypass or unbounded sleep", async () => {
  let calls = 0;
  await assert.rejects(
    fetchRespectingRateLimit(async () => {
      calls++;
      return new Response("", {
        status: 429,
        headers: { "Retry-After": "9999" },
      });
    }),
    /exceeds harness/,
  );
  assert.equal(calls, 1);
});
