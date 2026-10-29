import "dotenv/config";
import { randomUUID } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import Redis from "ioredis";
import { runCommand } from "../core/core.mjs";
import { harnessContext } from "../core/context.mjs";
const context = harnessContext(),
  runId = randomUUID(),
  executedAt = new Date().toISOString();
const targets = [
  {
    name: "Memurai native",
    url: process.env.TEST_MEMURAI_URL,
    mode: "memurai",
  },
  { name: "Redis Linux", url: process.env.TEST_REDIS_URL, mode: "redis" },
];
const assertions = [],
  artifacts = [];
let failed = false;
for (const target of targets) {
  if (!target.url) {
    assertions.push({
      name: target.name,
      expected: "configured actual service",
      actual: "missing",
      passed: false,
    });
    continue;
  }
  const redis = new Redis(target.url, {
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  redis.on("error", () => undefined);
  try {
    const info = await redis.info("server"),
      version = info.match(/redis_version:([^\r\n]+)/)?.[1],
      memurai = /memurai/i.test(info);
    const valid =
      target.mode === "memurai"
        ? memurai
        : !memurai && version?.startsWith("7.");
    assertions.push({
      name: target.name + " identity",
      expected:
        target.mode === "memurai" ? "Memurai Redis API7" : "Linux Redis7",
      actual: { version, memurai },
      passed: !!valid,
    });
    if (!valid) {
      failed = true;
      continue;
    }
    const command = [
      "node_modules/jest/bin/jest.js",
      "--config",
      "jest.integration.config.js",
      "--runInBand",
      "--runTestsByPath",
      "tests/integration/redis.integration.spec.ts",
      "tests/integration/cache-redis.integration.spec.ts",
    ];
    const result = await runCommand(process.execPath, command, {
      env: { ...process.env, TEST_REDIS_URL: target.url },
      timeoutMs: 180000,
    });
    assertions.push({
      name: target.name + " Lua/PubSub/delayed/retry/cache contracts",
      expected: "all tests pass",
      actual: result.status,
      passed: result.status === "PASS",
    });
    if (result.artifact) artifacts.push(result.artifact);
    if (result.status !== "PASS") failed = true;
  } catch {
    failed = true;
    assertions.push({
      name: target.name,
      expected: "reachable server",
      actual: "unavailable",
      passed: false,
    });
  } finally {
    redis.disconnect();
  }
}
const finalContext = harnessContext();
context.dirty ||= finalContext.dirty || finalContext.commit !== context.commit;
const status =
  assertions.every((a) => a.passed) && artifacts.length === 2
    ? "PASS"
    : failed
      ? "FAIL"
      : "BLOCKED";
const receipt = {
  runId,
  caseId: "OPS-02",
  ...context,
  executedAt,
  status,
  exitCode: status === "PASS" ? 0 : 1,
  command: ["node", "harness/suites/platform-cases.mjs"],
  assertions,
  artifacts,
};
await mkdir("harness/reports/receipts", { recursive: true });
await writeFile(
  `harness/reports/receipts/${runId}-platform.json`,
  JSON.stringify(receipt, null, 2),
);
console.log(JSON.stringify({ status, assertions }));
if (status !== "PASS") process.exitCode = 1;
