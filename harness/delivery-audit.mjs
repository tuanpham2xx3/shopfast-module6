import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { harnessContext } from "./context.mjs";
import { digest } from "./evidence.mjs";
const context = harnessContext(),
  runId = randomUUID(),
  executedAt = new Date().toISOString();
const gh = (...args) =>
  JSON.parse(execFileSync("gh", args, { encoding: "utf8", timeout: 30000 }));
const repo = "tuanpham2xx3/shopfast-module6";
const protection = gh("api", `repos/${repo}/branches/main/protection`);
const negative = gh(
  "pr",
  "view",
  "9",
  "--repo",
  repo,
  "--json",
  "state,mergedAt,headRefOid,statusCheckRollup",
);
const positive = gh(
  "pr",
  "view",
  "8",
  "--repo",
  repo,
  "--json",
  "state,mergedAt,headRefOid,statusCheckRollup",
);
const release = gh(
  "run",
  "view",
  "40690479298",
  "--repo",
  repo,
  "--json",
  "status,conclusion,headSha,createdAt,updatedAt,jobs",
);
const readme = await readFile("README.md", "utf8");
const brief = await readFile("docs/18-defense-walkthrough.md", "utf8");
const architecture = await readFile("docs/19-repository-structure.md", "utf8");
const dataflow = await readFile("docs/02-data-architecture.md", "utf8");
const gates = {};
let coverageSnapshot;
const ciReports = [];
for (const file of await readdir("harness/reports")) {
  if (!file.endsWith("-ci.json")) continue;
  const value = JSON.parse(await readFile(`harness/reports/${file}`, "utf8"));
  if (
    value.commit === context.commit &&
    value.configHash === context.configHash &&
    !value.dirty &&
    value.status === "PASS"
  )
    ciReports.push(value);
}
const ci = ciReports.sort(
  (a, b) => Date.parse(b.executedAt) - Date.parse(a.executedAt),
)[0];
if (ci) {
  const end = Date.parse(ci.executedAt),
    start =
      end - ci.cases.reduce((sum, c) => sum + (c.durationMs ?? 0), 0) - 5000;
  coverageSnapshot = {};
  for (const kind of ["unit-business", "business"]) {
    const path = `coverage/${kind}/coverage-summary.json`,
      metadata = await stat(path);
    const data = JSON.parse(await readFile(path, "utf8"));
    coverageSnapshot[kind] = {
      total: data.total,
      fresh: metadata.mtimeMs >= start && metadata.mtimeMs <= end + 5000,
      sha256: digest(await readFile(path)),
    };
  }
}
const assertion = (name, expected, actual, passed) => ({
  name,
  expected,
  actual,
  passed,
});
const required = protection.required_status_checks?.contexts ?? [];
const protectedChecks =
  required.includes("application-checks") &&
  required.includes("docs-checks") &&
  protection.required_status_checks.strict &&
  protection.enforce_admins.enabled;
const failure = negative.statusCheckRollup.find(
  (c) => c.name === "application-checks" && c.conclusion === "FAILURE",
);
const positiveChecks = ["application-checks", "docs-checks"].every((name) =>
  positive.statusCheckRollup.some(
    (c) => c.name === name && c.conclusion === "SUCCESS",
  ),
);
gates["branch-protection-history"] = [
  assertion(
    "required checks enforced for administrators",
    "strict application/docs checks",
    {
      required,
      strict: protection.required_status_checks.strict,
      admins: protection.enforce_admins.enabled,
    },
    protectedChecks,
  ),
  assertion(
    "successful checked PR merged",
    "PR8 MERGED with both checks SUCCESS",
    { state: positive.state, checks: positiveChecks },
    positive.state === "MERGED" && positiveChecks,
  ),
];
gates["ci-failure-blocks-merge"] = [
  assertion(
    "failed required application check retained without merge",
    "PR9 CLOSED, not merged, application-checks FAILURE under enforced required policy",
    {
      state: negative.state,
      mergedAt: negative.mergedAt,
      head: negative.headRefOid,
      failureUrl: failure?.detailsUrl,
      requiredPolicy: protectedChecks,
    },
    negative.state === "CLOSED" &&
      !negative.mergedAt &&
      !!failure &&
      protectedChecks,
  ),
];
gates.pipeline = [
  assertion(
    "successful build and deployment history",
    "completed successful Release workflow including images and deploy",
    {
      id: 40690479298,
      status: release.status,
      conclusion: release.conclusion,
      head: release.headSha,
      jobs: release.jobs.map((j) => ({
        name: j.name,
        conclusion: j.conclusion,
      })),
    },
    release.status === "completed" &&
      release.conclusion === "success" &&
      ["images", "deploy"].every((name) =>
        release.jobs.some((j) => j.name === name && j.conclusion === "success"),
      ),
  ),
];
gates["pipeline-success-fail-links"] = [
  ...gates.pipeline,
  ...gates["ci-failure-blocks-merge"],
];
const elapsed =
  (Date.parse(release.updatedAt) - Date.parse(release.createdAt)) / 1000;
gates["pipeline-total-duration"] = [
  assertion(
    "workflow total wall time",
    "positive duration below ten minutes",
    {
      workflow: 40690479298,
      createdAt: release.createdAt,
      updatedAt: release.updatedAt,
      seconds: elapsed,
    },
    elapsed > 0 && elapsed < 600 && release.conclusion === "success",
  ),
];
gates["readme-local-github"] = [
  assertion(
    "native local startup and public source instructions",
    "Node/PostgreSQL/Memurai, migrate/seed/API/worker/web/test commands, public repository and structure links",
    { sha256: digest(readme) },
    [
      "Node 20",
      "PostgreSQL 16",
      "Memurai",
      "npm ci",
      "npm run db:migrate",
      "npm run db:seed",
      "npm run dev:api",
      "npm run dev:worker",
      "npm run dev:web",
      "npm run test:integration",
      "https://github.com/tuanpham2xx3/shopfast-module6",
      "docs/19-repository-structure.md",
    ].every((text) => readme.includes(text)),
  ),
];
gates["integration-brief"] = [
  assertion(
    "seven integration topics and demo sequence",
    "all seven topics, endpoint/job/event explanations and ten-minute sequence",
    { sha256: digest(brief) },
    [
      "AI Agent",
      "Realtime",
      "Rate limit",
      "Cache",
      "Background jobs",
      "Nghiệp vụ",
      "Vận hành",
      "00:00",
      "10:00",
      "outbox",
      "ownership",
    ].every((text) => brief.includes(text)),
  ),
];
gates["architecture-review"] = [
  assertion(
    "documented module and data-flow boundaries",
    "composition root, platform boundary, transactional outbox and typed module model",
    { structureHash: digest(architecture), dataflowHash: digest(dataflow) },
    ["composition root", "Platform", "Browser", "transaction"].every((text) =>
      architecture.includes(text),
    ) &&
      ["mermaid", "Outbox", "PostgreSQL", "Gemini"].every((text) =>
        dataflow.includes(text),
      ),
  ),
];
gates["aws-diagram-dataflow-components"] = [
  assertion(
    "AWS and application flow documented",
    "EC2, OIDC/SSM, S3, API/socket/outbox/worker/provider flow and component responsibilities",
    { briefHash: digest(brief), dataflowHash: digest(dataflow) },
    [
      "EC2",
      "OIDC",
      "SSM",
      "S3",
      "Socket.IO",
      "outbox",
      "BullMQ",
      "Gemini",
      "Resend",
    ].every((text) => brief.includes(text)) &&
      dataflow.includes("## 2. Module contracts"),
  ),
];
gates["business-coverage-report"] = [
  assertion(
    "fresh executed unit and combined coverage",
    "matching clean CI execution, unit and combined line coverage >=60%",
    coverageSnapshot ?? "No matching clean CI report",
    !!coverageSnapshot &&
      Object.values(coverageSnapshot).every(
        (c) => c.fresh && c.total.lines.pct >= 60,
      ),
  ),
];
const report = {
  runId,
  ...context,
  executedAt,
  scope:
    "History gates retain observed historical workflow/PR SHAs; document checks assert explicit coverage, not human defense competence.",
  gates,
};
const bytes = Buffer.from(JSON.stringify(report, null, 2)),
  path = `harness/reports/artifacts/${runId}-delivery.json`;
await mkdir("harness/reports/artifacts", { recursive: true });
await mkdir("harness/reports/receipts", { recursive: true });
await writeFile(path, bytes);
for (const [gate, assertions] of Object.entries(gates)) {
  const passed = assertions.length > 0 && assertions.every((a) => a.passed);
  await writeFile(
    `harness/reports/receipts/${runId}-${gate}.json`,
    JSON.stringify(
      {
        runId,
        ...context,
        executedAt,
        caseId: `GATE-${gate}`,
        status: passed
          ? "PASS"
          : gate === "business-coverage-report" && !coverageSnapshot
            ? "BLOCKED"
            : "FAIL",
        exitCode: passed ? 0 : 1,
        command: ["node", "harness/delivery-audit.mjs"],
        assertions,
        artifacts: [{ path, bytes: bytes.length, sha256: digest(bytes) }],
      },
      null,
      2,
    ),
  );
}
const failed = Object.entries(gates)
  .filter(([, a]) => a.some((x) => !x.passed))
  .map(([g]) => g);
console.log(JSON.stringify({ gates: Object.keys(gates).length, failed }));
if (failed.length) process.exitCode = 1;
