import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { harnessContext } from "./context.mjs";
import { digest } from "./evidence.mjs";
const context = harnessContext(),
  runId = randomUUID(),
  executedAt = new Date().toISOString();
const candidates = [];
for (const directory of await readdir("docs/evidence/runs")) {
  const path = `docs/evidence/runs/${directory}/manifest.json`;
  try {
    const manifest = JSON.parse(await readFile(path, "utf8"));
    const summary = manifest.receipts?.find((r) => r.caseId === "RUN-SUMMARY");
    if (summary?.ciExecution?.status === "PASS" && !summary.dirty)
      candidates.push({ path, manifest, summary });
  } catch {}
}
const selected = candidates.sort(
  (a, b) => Date.parse(b.summary.executedAt) - Date.parse(a.summary.executedAt),
)[0];
if (!selected)
  throw Error(
    "No published coverage/restore execution bundle; export a matching clean run first",
  );
const { manifest, summary } = selected;
if (!/^[a-f0-9]{40}$/.test(summary.commit))
  throw Error("Invalid source execution SHA");
const git = (...args) =>
  execFileSync("git", args, { maxBuffer: 64 * 1024 * 1024 });
const artifactMap = new Map(manifest.artifacts.map((a) => [a.path, a]));
const blobs = new Map();
for (const artifact of manifest.artifacts) {
  if (
    !artifact.exportedPath?.startsWith("docs/evidence/runs/") ||
    artifact.exportedPath.includes("..")
  )
    throw Error("Invalid published artifact path");
  const bytes = git("show", `${context.commit}:${artifact.exportedPath}`);
  if (bytes.length !== artifact.bytes || digest(bytes) !== artifact.sha256)
    throw Error("Published Git artifact integrity failure");
  blobs.set(artifact.path, bytes);
}
const unit = JSON.parse(
  blobs.get("coverage/unit-business/coverage-summary.json") ?? "null",
);
const combined = JSON.parse(
  blobs.get("coverage/business/coverage-summary.json") ?? "null",
);
const restore = manifest.receipts.find((r) => r.caseId === "GATE-s3-restore");
const paths = [
  "apps",
  "libs",
  "database",
  "deploy",
  "tests",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "nest-cli.json",
  "jest.business.config.js",
  "jest.unit-business.config.js",
  "harness/remote-evidence.mjs",
  "harness/requirements.json",
];
const compatibility = paths.map((path) => ({
  path,
  executionTree: git("rev-parse", `${summary.commit}:${path}`)
    .toString()
    .trim(),
  currentTree: git("rev-parse", `${context.commit}:${path}`).toString().trim(),
}));
let publicRemote = false;
try {
  const repo = JSON.parse(
    execFileSync("gh", ["api", "repos/tuanpham2xx3/shopfast-module6"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
  const remote = JSON.parse(
    execFileSync(
      "gh",
      [
        "api",
        `repos/tuanpham2xx3/shopfast-module6/git/commits/${context.commit}`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ),
  );
  publicRemote = repo.private === false && remote.sha === context.commit;
} catch {}
const assertions = [
  {
    name: "public Git commit and immutable artifact bytes",
    expected:
      "public remote commit with all artifact hashes verified from Git blobs",
    actual: { publicRemote, artifacts: blobs.size, manifest: selected.path },
    passed: publicRemote && blobs.size > 0,
  },
  {
    name: "unit and combined coverage reports published",
    expected:
      "matching clean CI with raw unit/combined JSON, both line coverage >=60%",
    actual: {
      executionCommit: summary.commit,
      ci: summary.ciExecution,
      unit: unit?.total,
      combined: combined?.total,
    },
    passed:
      summary.ciExecution.commit === summary.commit &&
      !summary.ciExecution.dirty &&
      !!unit &&
      !!combined &&
      unit.total.lines.pct >= 60 &&
      combined.total.lines.pct >= 60,
  },
  {
    name: "restore execution published",
    expected: "passing S3 restore receipt with intact artifacts and assertions",
    actual: { sourceCommit: restore?.commit, status: restore?.status },
    passed:
      restore?.status === "PASS" &&
      restore.exitCode === 0 &&
      restore.assertions?.length >= 8 &&
      restore.assertions.every((a) => a.passed) &&
      restore.artifacts?.length > 0 &&
      restore.artifacts.every((a) => artifactMap.has(a.path)),
  },
  {
    name: "explicit backend/test/config compatibility",
    expected:
      "unchanged Git tree/blob IDs; execution SHA retained without relabeling",
    actual: compatibility,
    passed: compatibility.every((p) => p.executionTree === p.currentTree),
  },
];
const passed = assertions.every((a) => a.passed),
  report = {
    runId,
    ...context,
    executedAt,
    executionSourceCommit: summary.commit,
    sourceAcceptanceStatus: summary.status,
    scope:
      "Publication of coverage and restore evidence only. Original execution SHA and failures remain unchanged; compatibility is limited to the listed backend/test/config paths.",
    assertions,
  };
const path = `harness/reports/artifacts/${runId}-published-evidence.json`,
  bytes = Buffer.from(JSON.stringify(report, null, 2));
await mkdir("harness/reports/artifacts", { recursive: true });
await mkdir("harness/reports/receipts", { recursive: true });
await writeFile(path, bytes);
await writeFile(
  `harness/reports/receipts/${runId}-published-evidence.json`,
  JSON.stringify(
    {
      ...report,
      caseId: "GATE-published-coverage-restore",
      status: passed ? "PASS" : "FAIL",
      exitCode: passed ? 0 : 1,
      command: ["node", "harness/published-artifacts.mjs"],
      artifacts: [{ path, bytes: bytes.length, sha256: digest(bytes) }],
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    status: passed ? "PASS" : "FAIL",
    executionSourceCommit: summary.commit,
    sourceAcceptanceStatus: summary.status,
    assertions: assertions.map((a) => ({ name: a.name, passed: a.passed })),
  }),
);
if (!passed) process.exitCode = 1;
