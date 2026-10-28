const fs = require("node:fs");
const assert = require("node:assert/strict");
const fixture = process.env.HARNESS_RESTORE_DATABASE;
assert(/^harness_restore_[0-9]+$/.test(fixture || ""));
if (process.argv[2] === "server") {
  const database = new URL(process.env.DATABASE_URL);
  database.pathname = "/" + fixture;
  process.env.DATABASE_URL = database.href;
  require("/app/dist/apps/api/src/main.js");
} else {
  const values = Object.fromEntries(
    fs
      .readFileSync("/tmp/seed.env", "utf8")
      .trim()
      .split(/\r?\n/)
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
  (async () => {
    const base = "http://127.0.0.1:3000/api/v1";
    const login = await fetch(base + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: values.DEV_SEED_ADMIN_EMAIL || "admin@shopfast.test",
        password: values.DEV_SEED_PASSWORD,
      }),
      signal: AbortSignal.timeout(10000),
    });
    assert(login.ok, "Restored account login failed");
    const token = (await login.json()).data.accessToken;
    const headers = { Authorization: "Bearer " + token };
    const list = await fetch(base + "/staff/orders?pageSize=1", {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    assert(list.ok, "Restored orders list failed");
    const order = (await list.json()).data.items[0];
    assert(order, "Run staging fixture before restore acceptance");
    const detail = await fetch(base + "/staff/orders/" + order.id, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    assert(detail.ok, "Restored order detail failed");
    const body = (await detail.json()).data;
    assert.equal(body.id, order.id);
    assert(
      body.items.length && body.history.length,
      "Restored order snapshots missing",
    );
    console.log(
      JSON.stringify({ restoredLogin: true, restoredOrderRead: true }),
    );
  })().catch(() => {
    console.error("Restored API auth/order smoke failed; credentials omitted");
    process.exitCode = 1;
  });
}
