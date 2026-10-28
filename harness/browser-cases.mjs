import "dotenv/config";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { runCommand } from "./core.mjs";
import { harnessContext } from "./context.mjs";
import { digest } from "./evidence.mjs";
const context = harnessContext(),
  runId = randomUUID(),
  executedAt = new Date().toISOString();
await mkdir("harness/reports/receipts", { recursive: true });
const command = ["node_modules/@playwright/test/cli.js", "test"];
const runStartedAt = Date.now();
const run = await runCommand(process.execPath, command, { timeoutMs: 900000 });
const reportPath = "harness/reports/playwright-results.json";
let tests = [];
try {
  if ((await stat(reportPath)).mtimeMs < runStartedAt)
    throw new Error("Stale Playwright report");
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  function walk(suites) {
    for (const s of suites) {
      for (const spec of s.specs ?? [])
        tests.push({
          title: spec.title,
          ok: spec.ok,
          results: spec.tests.flatMap((t) =>
            t.results.map((r) => ({
              status: r.status,
              duration: r.duration,
              queueCounts:
                r.attachments?.find(
                  (attachment) => attachment.name === "queue-counts",
                )?.body ?? null,
            })),
          ),
          file: spec.file,
        });
      walk(s.suites ?? []);
    }
  }
  walk(report.suites ?? []);
} catch {}
const sourcePath = "tests/e2e/catalog-live.e2e.spec.ts",
  source = await readFile(sourcePath);
const safePath = `harness/reports/artifacts/${runId}-browser.json`,
  safe = Buffer.from(
    JSON.stringify({ runId, ...context, executedAt, tests }, null, 2),
  );
await writeFile(safePath, safe);
const browserTest = tests.find((t) => t.title.includes("UI-01 RT-04"));
const passed =
  run.status === "PASS" &&
  browserTest?.ok &&
  browserTest.results.length > 0 &&
  browserTest.results.every((r) => r.status === "passed");
const artifacts = [
  run.artifact,
  { path: safePath, bytes: safe.length, sha256: digest(safe) },
  { path: sourcePath, bytes: source.length, sha256: digest(source) },
].filter(Boolean);
for (const path of [
  "harness/reports/reconnect-recovered.png",
  "harness/reports/ui-refresh-admin-mobile.png",
]) {
  try {
    const data = await readFile(path);
    artifacts.push({ path, bytes: data.length, sha256: digest(data) });
  } catch {}
}
const finalContext = harnessContext();
context.dirty ||= finalContext.dirty || finalContext.commit !== context.commit;
const receipts = ["RT-04", "UI-01"].map((caseId) => ({
  runId,
  caseId,
  ...context,
  executedAt,
  status: passed && artifacts.length === 5 ? "PASS" : "FAIL",
  exitCode: run.exitCode,
  command: ["node", ...command],
  assertions: [
    {
      name: browserTest?.title ?? "Required browser case missing",
      expected:
        "actual browser purchase, warehouse/support/admin actions and offline recovery pass",
      actual: browserTest ?? null,
      passed: !!passed,
    },
  ],
  artifacts,
}));
await writeFile(
  `harness/reports/receipts/${runId}-browser.json`,
  JSON.stringify(receipts, null, 2),
);
let queueCounts = null;
try {
  queueCounts = JSON.parse(
    Buffer.from(
      browserTest?.results.at(-1)?.queueCounts ?? "",
      "base64",
    ).toString("utf8"),
  );
} catch {}
const countsValid =
  !!passed &&
  queueCounts?.status === "ok" &&
  ["waiting", "active", "completed", "failed"].every(
    (state) =>
      Number.isInteger(queueCounts.counts?.[state]) &&
      queueCounts.counts[state] >= 0,
  );
await writeFile(
  `harness/reports/receipts/${runId}-queue-dashboard.json`,
  JSON.stringify(
    {
      ...receipts[1],
      caseId: "GATE-queue-dashboard-counts",
      status: countsValid ? "PASS" : "BLOCKED",
      assertions: [
        {
          name: "Browser loads and displays actual Redis queue counts",
          expected: "ok with numeric waiting/active/completed/failed",
          actual: queueCounts,
          passed: countsValid,
        },
      ],
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    status: receipts.every((r) => r.status === "PASS") ? "PASS" : "FAIL",
    cases: receipts.map((r) => ({ id: r.caseId, status: r.status })),
  }),
);
if (receipts.some((r) => r.status !== "PASS")) process.exitCode = 1;
