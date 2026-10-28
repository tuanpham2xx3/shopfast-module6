import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { Server } from "socket.io";
import { io } from "socket.io-client";
import { observeOrderSubscription } from "./continuity-observer.mjs";
async function fixture(handler, run) {
  const http = createServer(),
    server = new Server(http);
  server.of("/orders").on("connection", handler);
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  const socket = io(`http://127.0.0.1:${http.address().port}/orders`, {
    autoConnect: false,
    transports: ["websocket"],
    reconnectionDelay: 20,
    reconnectionDelayMax: 20,
    randomizationFactor: 0,
  });
  const observer = observeOrderSubscription(socket, "synthetic-order", {
    timeoutMs: 250,
  });
  try {
    socket.connect();
    await run(observer, socket);
  } finally {
    observer.stop();
    socket.disconnect();
    await new Promise((resolve) => server.close(resolve));
  }
}
async function until(check) {
  const end = Date.now() + 3000;
  while (!check()) {
    if (Date.now() > end) throw Error("Observation did not converge");
    await new Promise((r) => setTimeout(r, 10));
  }
}
test("a real transport close during pending ack is retained and reconnect must acknowledge the new socket", async () => {
  let connections = 0;
  await fixture(
    (socket) => {
      const n = ++connections;
      socket.on("order.subscribe", (_request, ack) => {
        if (n === 1) socket.conn.close();
        else ack({ ok: true, currentVersion: 2 });
      });
    },
    async (observer, socket) => {
      await until(observer.isFresh);
      assert(connections >= 2);
      assert.equal(observer.errors.length, 0);
      assert(observer.attempts.some((a) => a.outcome === "disconnected"));
      assert(observer.subscriptions.some((s) => s.socketId === socket.id));
    },
  );
});
test("a connected ack timeout remains a failure, not an expected reconnect", async () => {
  await fixture(
    (socket) => {
      socket.on("order.subscribe", () => {});
    },
    async (observer) => {
      await until(() => observer.errors.length > 0);
      assert.equal(observer.isFresh(), false);
      assert.equal(observer.attempts[0].outcome, "connected-ack-failure");
    },
  );
});
test("an authorization denial remains fatal even with a connected transport", async () => {
  await fixture(
    (socket) => {
      socket.on("order.subscribe", (_request, ack) =>
        ack({ ok: false, code: "NOT_FOUND" }),
      );
    },
    async (observer) => {
      await until(() => observer.errors.length > 0);
      assert.equal(observer.isFresh(), false);
      assert.equal(observer.errors[0], "subscription denied");
    },
  );
});
