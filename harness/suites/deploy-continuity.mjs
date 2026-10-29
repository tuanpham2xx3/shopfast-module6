import "dotenv/config";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { io } from "socket.io-client";
import { submitBrowserLogin } from "../collectors/browser-login.mjs";
import { runCommand } from "../core/core.mjs";
import { harnessContext } from "../core/context.mjs";
import { digest } from "../core/evidence.mjs";
import { randomUUID } from "node:crypto";
import { fetchRespectingRateLimit } from "../core/http-retry.mjs";
import { observeOrderSubscription } from "../core/continuity-observer.mjs";
const executionContext = harnessContext();
const base = "https://shopfast.tuanpq.com",
  candidate =
    process.env.HARNESS_CONTINUITY_SHA ?? process.env.HARNESS_CANDIDATE_SHA;
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
  observer,
  polling = true,
  pollTask,
  deployStarted = false,
  restored = false;
const samples = [],
  errors = [],
  subscriptions = [],
  subscriptionAttempts = [];
let deploy, rollback;
const started = Date.now();
try {
  const login = await fetchRespectingRateLimit(
    () =>
      fetch(base + "/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: base },
        body: JSON.stringify({
          email: fixture.email,
          password: fixture.password,
        }),
        signal: AbortSignal.timeout(15000),
      }),
    {
      onWait: (delay) =>
        console.log(
          `Continuity login HTTP429: respecting Retry-After ${Math.ceil(delay / 1000)}s`,
        ),
    },
  );
  assert(login.ok, `Continuity API login HTTP${login.status}`);
  const token = (await login.json()).data.accessToken;
  const headers = { Authorization: `Bearer ${token}` };
  await page.goto(new URL("/login", base).href);
  await page.getByLabel("Email", { exact: true }).fill(fixture.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(fixture.password);
  await submitBrowserLogin(page);
  await page.getByRole("button", { name: "Đơn hàng", exact: true }).click();
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
    autoConnect: false,
  });
  observer = observeOrderSubscription(socket, fixture.orderId, {
    subscriptions,
    errors,
    attempts: subscriptionAttempts,
  });
  socket.connect();
  await expect.poll(observer.isFresh).toBe(true);
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
  await page.getByRole("button", { name: "Đơn hàng", exact: true }).click();
  await page.getByRole("button").filter({ hasText: fixture.orderCode }).click();
  await expect(
    page
      .getByLabel("Chi tiết đơn hàng")
      .getByText("Đã giao", { exact: true })
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
    else {
      try {
        await expect.poll(observer.isFresh, { timeout: 45000 }).toBe(true);
        await expect(
          page
            .getByLabel("Chi tiết đơn hàng")
            .getByText("Đang theo dõi trực tiếp", { exact: true }),
        ).toBeVisible({ timeout: 45000 });
        await expect(
          page
            .getByLabel("Chi tiết đơn hàng")
            .getByText("Đã giao", { exact: true })
            .first(),
        ).toBeVisible();
      } catch {
        errors.push(
          "Restored private subscription or browser order session did not recover",
        );
      }
    }
  }
  polling = false;
  await pollTask;
  observer?.stop();
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
    subscriptionAttempts,
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
  const finalContext = harnessContext();
  executionContext.dirty ||=
    finalContext.dirty || finalContext.commit !== executionContext.commit;
  const reportPath = `harness/reports/continuity-${started}.json`;
  const content = await readFile(reportPath);
  const receipt = {
    runId: randomUUID(),
    caseId: "GATE-active-deploy-continuity",
    ...executionContext,
    executedAt: result.executedAt,
    status: result.status,
    exitCode: result.status === "PASS" ? 0 : 1,
    command: ["node", "harness/suites/deploy-continuity.mjs"],
    assertions: [
      {
        name: "authenticated HTTP reads across promotion/rollback",
        expected: "at least five reads and zero errors",
        actual: { samples: samples.length, errors },
        passed: samples.length >= 5 && errors.length === 0,
      },
      {
        name: "private subscription survives via reconnect",
        expected: "at least two successful subscriptions",
        actual: subscriptions.length,
        passed: subscriptions.length >= 2,
      },
      {
        name: "restore original release",
        expected: true,
        actual: restored,
        passed: restored,
      },
    ],
    artifacts: [
      { path: reportPath, bytes: content.length, sha256: digest(content) },
    ],
    targetCommit: original,
    candidateCommit: candidate,
  };
  if (receipt.assertions.some((assertion) => !assertion.passed))
    receipt.status = "FAIL";
  await mkdir("harness/reports/receipts", { recursive: true });
  await writeFile(
    `harness/reports/receipts/${receipt.runId}-continuity.json`,
    JSON.stringify(receipt, null, 2),
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
