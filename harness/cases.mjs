import "dotenv/config";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { runCommand } from "./core.mjs";
import { harnessContext } from "./context.mjs";
import { digest } from "./evidence.mjs";
const context = harnessContext(),
  runId = randomUUID(),
  executedAt = new Date().toISOString();
await mkdir("harness/reports/receipts", { recursive: true });
const registry = JSON.parse(
  await readFile("harness/requirements.json", "utf8"),
);
const map = JSON.parse(await readFile("harness/acceptance-map.json", "utf8"));
if (
  JSON.stringify(registry.cases.map((c) => c.id).sort()) !==
  JSON.stringify(map.cases.map((c) => c.id).sort())
)
  throw Error("Case mapping omits required cases");
const raw = `harness/reports/${runId}-jest-raw.json`;
const command = [
  "node_modules/jest/bin/jest.js",
  "--config",
  "jest.business.config.js",
  "--runInBand",
  "--json",
  `--outputFile=${raw}`,
];
const run = await runCommand(process.execPath, command, { timeoutMs: 900000 });
let suites = [];
try {
  const report = JSON.parse(await readFile(raw, "utf8"));
  suites = report.testResults.map((s) => ({
    file: s.name.replaceAll("\\", "/"),
    status: s.status,
    tests: s.assertionResults.map((t) => ({
      title: t.title,
      fullName: t.fullName,
      status: t.status,
      duration: t.duration,
    })),
  }));
} catch {}
const resultPath = `harness/reports/artifacts/${runId}-assertions.json`;
const bytes = Buffer.from(
  JSON.stringify({ runId, ...context, executedAt, suites }, null, 2),
);
await writeFile(resultPath, bytes);
const artifact = {
  path: resultPath,
  bytes: bytes.length,
  sha256: digest(bytes),
};
const finalContext = harnessContext();
context.dirty ||= finalContext.dirty || finalContext.commit !== context.commit;
const receipts = [];
for (const c of map.cases) {
  const assertions = [];
  let status = "PASS",
    reason;
  for (const selector of c.selectors) {
    const matches = suites
      .filter((s) => s.file.endsWith("/" + selector.file))
      .flatMap((s) =>
        s.tests
          .filter((t) => t.title.includes(selector.titleIncludes))
          .map((t) => ({ ...t, file: s.file })),
      );
    const passed = matches.length === 1 && matches[0].status === "passed";
    assertions.push({
      name: selector.file + "#" + selector.titleIncludes,
      expected: "one passing assertion",
      actual: matches.map((t) => ({ test: t.fullName, status: t.status })),
      passed,
    });
    if (!passed)
      status = matches.some((t) => t.status === "failed") ? "FAIL" : "BLOCKED";
  }
  if (c.external) {
    status = "BLOCKED";
    reason = `Requires external evidence: ${c.external}; Jest cannot prove this case alone`;
  }
  if (run.status === "FAIL" && status === "PASS") {
    status = "BLOCKED";
    reason = "Suite failed; do not certify cases from incomplete run";
  }
  const artifacts = [artifact, ...(run.artifact ? [run.artifact] : [])];
  for (const filename of new Set(
    c.selectors.flatMap((selector) =>
      suites
        .filter((s) => s.file.endsWith("/" + selector.file))
        .map((s) => s.file),
    ),
  )) {
    const content = await readFile(filename);
    const relative = filename.slice(
      process.cwd().replaceAll("\\", "/").length + 1,
    );
    artifacts.push({
      path: relative,
      bytes: content.length,
      sha256: digest(content),
    });
  }
  receipts.push({
    runId,
    caseId: c.id,
    ...context,
    executedAt,
    status,
    reason,
    exitCode: run.exitCode,
    command: ["node", ...command],
    assertions,
    artifacts,
  });
}
await writeFile(
  `harness/reports/receipts/${runId}-cases.json`,
  JSON.stringify(receipts, null, 2),
);
const partnerCase = receipts.find((receipt) => receipt.caseId === "JOB-03");
const swaggerTest = suites
  .flatMap((suite) => suite.tests)
  .find((test) => test.title.includes("F07 generates and serves Swagger"));
await writeFile(
  `harness/reports/receipts/${runId}-swagger.json`,
  JSON.stringify(
    {
      runId,
      caseId: "GATE-swagger-generated-live",
      ...context,
      executedAt,
      status:
        run.status === "PASS" && swaggerTest?.status === "passed"
          ? "PASS"
          : "BLOCKED",
      exitCode: run.exitCode,
      command: ["node", ...command],
      assertions: [
        {
          name: "Actual test application serves generated Swagger UI and OpenAPI routes",
          expected: "passing HTTP assertions",
          actual: swaggerTest ?? null,
          passed: run.status === "PASS" && swaggerTest?.status === "passed",
        },
      ],
      artifacts: [artifact, ...(run.artifact ? [run.artifact] : [])],
      scope:
        "Non-production isolated test application; Swagger remains disabled in production by policy.",
    },
    null,
    2,
  ),
);
if (partnerCase) {
  const partnerAssertions = partnerCase.assertions.filter((assertion) =>
    assertion.name.includes("never overwrites a newer partner"),
  );
  await writeFile(
    `harness/reports/receipts/${runId}-partner-demo.json`,
    JSON.stringify(
      {
        ...partnerCase,
        caseId: "GATE-partner-versioned-demo",
        status:
          partnerCase.status === "PASS" &&
          partnerAssertions.length === 1 &&
          partnerAssertions[0].passed
            ? "PASS"
            : "BLOCKED",
        assertions: partnerAssertions,
        scope:
          "User-approved PostgreSQL versioned partner demo; no third-party HTTP service or delivery claim. Queue/retry/dedup gates are assessed separately.",
      },
      null,
      2,
    ),
  );
}
const summary = {
  runId,
  ...context,
  executedAt,
  status: receipts.every((r) => r.status === "PASS")
    ? "PASS"
    : receipts.some((r) => r.status === "FAIL")
      ? "FAIL"
      : "BLOCKED",
  counts: Object.fromEntries(
    ["PASS", "FAIL", "BLOCKED"].map((s) => [
      s,
      receipts.filter((r) => r.status === s).length,
    ]),
  ),
  cases: receipts.map(({ caseId, status, reason, assertions }) => ({
    caseId,
    status,
    reason,
    assertions,
  })),
};
await writeFile(
  "harness/reports/acceptance-cases.json",
  JSON.stringify(summary, null, 2),
);
console.log(
  JSON.stringify({
    status: summary.status,
    counts: summary.counts,
    dirty: context.dirty,
  }),
);
if (summary.status !== "PASS") process.exitCode = 1;
