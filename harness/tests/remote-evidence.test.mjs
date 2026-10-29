import test from "node:test";
import assert from "node:assert/strict";
import { validateRemote } from "../core/remote-evidence.mjs";
test("performance evidence requires actual sample sizes, thresholds, duration and error counts", () => {
  const report = {
    status: "PASS",
    stats: {
      catalog: { count: 30000, p95: 6 },
      checkout: { count: 900, p95: 17 },
      secondRead: { count: 30, p95: 7 },
      realtime: { count: 100, max: 14 },
    },
    cacheHitRate: 0.96,
    failures: 0,
    rateLimited: 0,
    warmupMs: 120000,
    measureMs: 600000,
    dataset: { customers: 200000, products: 10000, orders: 100000 },
  };
  assert(validateRemote("performance", report).every((c) => c.passed));
  for (const patch of [
    { stats: {} },
    { cacheHitRate: 1.1 },
    { rateLimited: 1 },
    { measureMs: 1000 },
    { stats: { ...report.stats, secondRead: { count: 29, p95: 1 } } },
    { stats: { ...report.stats, catalog: { count: 30000, p95: 50 } } },
  ])
    assert(
      validateRemote("performance", { ...report, ...patch }).some(
        (c) => !c.passed,
      ),
    );
});
test("restore and rollback cannot pass from status alone or missed deadline", () => {
  assert(
    validateRemote("backup-restore", { status: "PASS" }).some((c) => !c.passed),
  );
  const rollback = {
    status: "PASS",
    durationSeconds: 6,
    previousFrontendRestored: true,
    previousNginxRestored: true,
    httpsReady: true,
    injection: "forced post-promotion health rejection",
  };
  assert(validateRemote("deploy-rollback", rollback).every((c) => c.passed));
  assert(
    validateRemote("deploy-rollback", {
      ...rollback,
      durationSeconds: 120,
    }).some((c) => !c.passed),
  );
  assert(
    validateRemote("redis-outage", { status: "PASS", checks: [] }).some(
      (c) => !c.passed,
    ),
  );
});
