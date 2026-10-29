import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { runCommand } from "./core.mjs";
export function validateRemote(profile, data) {
  const checks = [];
  const check = (name, expected, actual, passed) =>
    checks.push({ name, expected, actual, passed });
  check("report status", "PASS", data?.status, data?.status === "PASS");
  const number = (value) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0;
  if (profile === "performance") {
    for (const [key, count, limit] of [
      ["catalog", 1000, 50],
      ["checkout", 100, 300],
      ["secondRead", 30, 20],
    ]) {
      const stat = data?.stats?.[key];
      check(
        key + " samples",
        `>=${count}`,
        stat?.count,
        number(stat?.count) && stat.count >= count,
      );
      check(
        key + " p95",
        `<${limit}ms`,
        stat?.p95,
        number(stat?.p95) && stat.p95 < limit,
      );
    }
    check(
      "realtime samples",
      ">=100",
      data?.stats?.realtime?.count,
      number(data?.stats?.realtime?.count) && data.stats.realtime.count >= 100,
    );
    check(
      "realtime max",
      "<1000ms",
      data?.stats?.realtime?.max,
      number(data?.stats?.realtime?.max) && data.stats.realtime.max < 1000,
    );
    check(
      "cache hit",
      ">=80% and <=100%",
      data?.cacheHitRate,
      number(data?.cacheHitRate) &&
        data.cacheHitRate >= 0.8 &&
        data.cacheHitRate <= 1,
    );
    check(
      "errors and 429",
      0,
      { failures: data?.failures, rateLimited: data?.rateLimited },
      data?.failures === 0 && data?.rateLimited === 0,
    );
    check(
      "measurement duration",
      "warmup>=120s, measure>=600s",
      { warmup: data?.warmupMs, measure: data?.measureMs },
      data?.warmupMs >= 120000 && data?.measureMs >= 600000,
    );
    check(
      "dataset",
      "200k customers/10k products/100k orders",
      data?.dataset,
      data?.dataset?.customers >= 200000 &&
        data?.dataset?.products >= 10000 &&
        data?.dataset?.orders >= 100000,
    );
  } else if (profile === "backup-restore") {
    for (const key of [
      "checksumVerified",
      "isolatedDatabase",
      "tableCountsMatched",
      "restoredLogin",
      "restoredOrderRead",
      "invoicePdfAndChecksum",
    ])
      check(key, true, data?.[key], data?.[key] === true);
    check(
      "restore deadline",
      "<1800s",
      data?.durationSeconds,
      number(data?.durationSeconds) && data.durationSeconds < 1800,
    );
  } else if (profile === "worker-crash") {
    for (const expected of [
      "real worker process SIGKILL after accepted side effect",
      "expired lease reclaimed by restarted process",
      "one delivery despite two attempts",
      "durable execution succeeded",
    ])
      check(
        expected,
        true,
        data?.checks?.includes(expected),
        data?.checks?.includes(expected) === true,
      );
  } else if (profile === "redis-outage") {
    for (const expected of [
      "warm real Redis cache",
      "price mutation while Redis process stopped",
      "DB fallback serves new price",
      "restart and targeted invalidation before cache resumes",
    ])
      check(
        expected,
        true,
        data?.checks?.includes(expected),
        data?.checks?.includes(expected) === true,
      );
  } else if (profile === "deploy-rollback") {
    for (const key of [
      "previousFrontendRestored",
      "previousNginxRestored",
      "httpsReady",
    ])
      check(key, true, data?.[key], data?.[key] === true);
    check(
      "rollback deadline",
      "<120s",
      data?.durationSeconds,
      number(data?.durationSeconds) && data.durationSeconds < 120,
    );
    check(
      "injection",
      "post-promotion health rejection",
      data?.injection,
      typeof data?.injection === "string" &&
        data.injection.includes("post-promotion health rejection"),
    );
  } else throw Error("Unknown remote validation profile");
  return checks;
}
const remoteFiles = {
  performance: "reports/performance.json",
  "backup-restore": "restore/latest-report.json",
  "worker-crash": "reports/resilience.json",
  "redis-outage": "reports/redis-outage.json",
  "deploy-rollback": "reports/rollback.json",
};
const gateMap = {
  performance: [
    "performance-read",
    "performance-checkout",
    "performance-realtime",
    "performance-hit",
  ],
  "backup-restore": ["s3-restore"],
  "worker-crash": ["worker-process-crash"],
  "redis-outage": ["redis-process-outage"],
  "deploy-rollback": ["rollback-injection"],
};
export async function recordRemoteProfile(profile, context, startedAt) {
  const file = remoteFiles[profile];
  if (!file) throw Error("Remote profile not allowed");
  const command = [
    "ssh",
    "-o",
    "BatchMode=yes",
    "-i",
    ".secrets/shopfast-ec2.pem",
    "ubuntu@3.27.169.177",
    `sudo python3 -c 'import json,os; p="/opt/shopfast/${file}"; print(json.dumps({"mtime":os.path.getmtime(p),"report":json.load(open(p))}))'`,
  ];
  const result = await runCommand(command[0], command.slice(1), {
    timeoutMs: 20000,
  });
  let envelope;
  try {
    envelope = JSON.parse(result.output);
  } catch {}
  const assertions = [
    {
      name: "remote report freshly written by this execution",
      expected: "mtime >= run start minus 5 seconds",
      actual: envelope?.mtime,
      passed:
        result.status === "PASS" &&
        typeof envelope?.mtime === "number" &&
        envelope.mtime * 1000 >= startedAt - 5000 &&
        envelope.mtime * 1000 <= Date.now() + 5000,
    },
  ];
  if (envelope?.report)
    assertions.push(...validateRemote(profile, envelope.report));
  const status = assertions.every((a) => a.passed) ? "PASS" : "FAIL",
    runId = randomUUID(),
    executedAt = new Date().toISOString();
  const ids = [
    ...gateMap[profile].map((g) => "GATE-" + g),
    ...(profile === "performance" ? ["CACHE-01"] : []),
  ];
  const receipts = ids.map((caseId) => ({
    runId,
    caseId,
    ...context,
    executedAt,
    status,
    exitCode: status === "PASS" ? 0 : 1,
    command,
    assertions,
    artifacts: result.artifact ? [result.artifact] : [],
    scope:
      profile === "performance"
        ? "Isolated synthetic dataset, TLS load generator on the same EC2; not Internet RTT or live provider load."
        : profile,
  }));
  await mkdir("harness/reports/receipts", { recursive: true });
  await writeFile(
    `harness/reports/receipts/${runId}-remote.json`,
    JSON.stringify(receipts, null, 2),
  );
  return { status, receipts: ids.length };
}
