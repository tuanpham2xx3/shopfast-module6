import "dotenv/config";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { io } from "socket.io-client";
import { submitBrowserLogin } from "./browser-login.mjs";
import { runCommand } from "./core.mjs";
const base = "https://shopfast.tuanpq.com",
  candidate = process.env.HARNESS_CANDIDATE_SHA;
assert(/^[a-f0-9]{40}$/.test(candidate ?? ""), "Built candidate SHA required");
const sshArgs = [
  "-o",
  "BatchMode=yes",
  "-i",
  ".secrets/shopfast-ec2.pem",
  "ubuntu@3.27.169.177",
];
const ssh = async (command) =>
  runCommand("ssh", [...sshArgs, command], { timeoutMs: 660000 });
const manifest = await ssh("cat /opt/shopfast/release.json");
assert.equal(manifest.status, "PASS");
const original = JSON.parse(manifest.output).commit;
assert.notEqual(
  candidate,
  original,
  "Candidate must differ from active release",
);
const fixture = JSON.parse(
  await readFile(".secrets/harness-staging-context.json", "utf8"),
);
assert(
  Date.now() - Date.parse(fixture.executedAt) < 3600000,
  "Run staging first; fixture older than 1h",
);
const browser = await chromium.launch(),
  context = await browser.newContext(),
  page = await context.newPage();
let socket,
  polling = true,
  pollTask,
  deployStarted = false,
  restored = false;
const samples = [],
  errors = [],
  subscriptions = [];
let deploy, rollback;
const started = Date.now();
try {
  const login = await fetch(base + "/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ email: fixture.email, password: fixture.password }),
    signal: AbortSignal.timeout(15000),
  });
  assert(login.ok, "Continuity API login failed");
  const token = (await login.json()).data.accessToken;
  const headers = { Authorization: `Bearer ${token}` };
  await page.goto(base);
  await page
    .getByRole("button", { name: "Đã có tài khoản? Đăng nhập", exact: true })
    .click();
  await page.getByLabel("Email", { exact: true }).fill(fixture.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(fixture.password);
  await submitBrowserLogin(page);
  await page
    .getByRole("button", { name: "Khám phá sản phẩm", exact: true })
    .click();
  await page.getByRole("button").filter({ hasText: fixture.orderCode }).click();
  const detail = page.getByLabel("Chi tiết đơn hàng");
  await expect(
    detail.getByText("Đang theo dõi trực tiếp", { exact: true }),
  ).toBeVisible();
  socket = io(base + "/orders", {
    auth: { token },
    transports: ["websocket"],
    reconnection: true,
    reconnectionDelay: 250,
    reconnectionDelayMax: 1000,
  });
  socket.on("connect", async () => {
    try {
      const ack = await socket
        .timeout(5000)
        .emitWithAck("order.subscribe", { orderId: fixture.orderId });
      if (!ack.ok) errors.push("subscription denied");
      else subscriptions.push({ at: Date.now(), version: ack.currentVersion });
    } catch {
      errors.push("subscribe timeout");
    }
  });
  await expect.poll(() => subscriptions.length).toBeGreaterThan(0);
  const orderResponse = await fetch(
    base + `/api/v1/orders/${fixture.orderId}`,
    { headers },
  );
  assert(orderResponse.ok);
  const before = (await orderResponse.json()).data;
  pollTask = (async () => {
    while (polling) {
      const t = Date.now();
      try {
        const response = await fetch(
          base + `/api/v1/orders/${fixture.orderId}`,
          { headers, signal: AbortSignal.timeout(5000) },
        );
        const json = await response.json();
        samples.push({
          at: t,
          status: response.status,
          durationMs: Date.now() - t,
          version: json.data?.version,
        });
        if (
          !response.ok ||
          json.data?.id !== fixture.orderId ||
          json.data?.version < before.version
        )
          errors.push("authenticated order read failed");
      } catch (error) {
        samples.push({
          at: t,
          status: 0,
          durationMs: Date.now() - t,
          error: error.name,
          cause: error.cause?.code ?? null,
        });
        errors.push("request unavailable");
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  })();
  await page.screenshot({
    path: "harness/reports/continuity-before.png",
    fullPage: true,
  });
  deployStarted = true;
  deploy = await ssh(`sudo bash /opt/shopfast/deploy-release.sh ${candidate}`);
  assert.equal(deploy.status, "PASS", "Candidate deployment failed");
  await expect(
    detail.getByText("Đang theo dõi trực tiếp", { exact: true }),
  ).toBeVisible({ timeout: 45000 });
  await page.reload();
  await page
    .getByRole("button", { name: "Khám phá sản phẩm", exact: true })
    .click();
  await page.getByRole("button").filter({ hasText: fixture.orderCode }).click();
  await expect(
    page
      .getByLabel("Chi tiết đơn hàng")
      .getByText("DELIVERED", { exact: true })
      .first(),
  ).toBeVisible();
  await page.screenshot({
    path: "harness/reports/continuity-promoted.png",
    fullPage: true,
  });
  rollback = await ssh(
    `sudo bash /opt/shopfast/rollback-rehearsal.sh ${original}`,
  );
  assert.equal(
    rollback.status,
    "PASS",
    "Injected unhealthy release rollback failed",
  );
  assert.equal(errors.length, 0, errors.join(";"));
  assert(samples.length >= 5, "Insufficient continuity observations");
} catch (e) {
  errors.push(e.message);
} finally {
  if (deployStarted) {
    const restore = await ssh(
      `sudo bash /opt/shopfast/deploy-release.sh ${original}`,
    );
    restored = restore.status === "PASS";
    if (!restored) errors.push("Failed to restore original release");
  }
  polling = false;
  await pollTask;
  socket?.disconnect();
  await browser.close();
  const result = {
    status: errors.length ? "FAIL" : "PASS",
    executedAt: new Date().toISOString(),
    original,
    candidate,
    restored,
    durationMs: Date.now() - started,
    samples,
    subscriptions,
    errors,
    deploy,
    rollback,
    scope:
      "Authenticated browser order session, HTTP reads and private socket across healthy promotion and injected unhealthy candidate rollback. No host failure/HA claim.",
  };
  await mkdir("harness/reports", { recursive: true });
  await writeFile(
    `harness/reports/continuity-${started}.json`,
    JSON.stringify(result, null, 2),
  );
  await writeFile(
    "harness/reports/deploy-continuity.json",
    JSON.stringify(result, null, 2),
  );
  console.log(
    JSON.stringify({
      status: result.status,
      observations: samples.length,
      socketSubscriptions: subscriptions.length,
      restored,
    }),
  );
  if (result.status !== "PASS") process.exitCode = 1;
}
