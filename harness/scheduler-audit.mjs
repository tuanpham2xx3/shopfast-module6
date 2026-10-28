import { spawnSync } from "node:child_process";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve, relative } from "node:path";
import { randomUUID } from "node:crypto";
const { harnessContext } = await import(
  pathToFileURL(resolve("harness/context.mjs")).href
);
const { digest, verifyArtifact } = await import(
  pathToFileURL(resolve("harness/evidence.mjs")).href
);
const context = harnessContext(),
  runId = randomUUID(),
  executedAt = new Date().toISOString();
const remoteScript = `set -euo pipefail
cd /opt/shopfast
sha=$(python3 -c 'import json;print(json.load(open("release.json"))["commit"])')
[[ "$sha" =~ ^[a-f0-9]{40}$ ]]
worker="shopfast-worker-$sha"
printf 'release\\t%s\\n' "$sha"
printf 'running\\t'; docker inspect -f '{{.State.Running}}' "$worker"
printf 'command\\t'; docker inspect -f '{{json .Config.Cmd}}' "$worker"
printf 'compiled\\t'; docker exec "$worker" node -e 'const W=require("/app/dist/apps/worker/src/foundation-worker.js").FoundationWorker;const J=require("/app/dist/libs/modules/jobs/src/jobs.service.js").JobsService;const init=W.prototype.onModuleInit.toString(),tick=W.prototype.tick.toString(),catchup=J.prototype.catchUp.toString();console.log(JSON.stringify({timer:init.includes("setInterval")&&init.includes("250"),catchUpPolling:tick.includes("catchUp")&&tick.includes("15000"),reminder30Minutes:catchup.includes("1800000")&&catchup.includes("payment.remind"),bangkokDaily:catchup.includes("Asia/Bangkok")&&catchup.includes("revenue.daily")&&catchup.includes("generate_series")}))'
`;
const remote = spawnSync(
  "ssh",
  [
    "-o",
    "BatchMode=yes",
    "-i",
    ".secrets/shopfast-ec2.pem",
    "ubuntu@3.27.169.177",
    "sudo bash -s",
  ],
  { input: remoteScript, encoding: "utf8", timeout: 45000 },
);
const values = Object.fromEntries(
  (remote.stdout ?? "")
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.includes("\t"))
    .map((line) => {
      const p = line.indexOf("\t");
      return [line.slice(0, p), line.slice(p + 1)];
    }),
);
let compiled, command;
try {
  compiled = JSON.parse(values.compiled);
  command = JSON.parse(values.command);
} catch {}
const candidates = [];
for (const file of await readdir("harness/reports/receipts")) {
  if (!file.endsWith(".json")) continue;
  const x = JSON.parse(
    await readFile("harness/reports/receipts/" + file, "utf8"),
  );
  candidates.push(...(Array.isArray(x) ? x : [x]));
}
const assertions = [
  {
    name: "production worker entrypoint and schedule hooks",
    expected:
      "running exact source release, worker main command, 250ms timer/15s catch-up polling, 30m reminder and Bangkok daily hook",
    actual: {
      release: values.release,
      running: values.running,
      command,
      compiled,
    },
    passed:
      remote.status === 0 &&
      values.release === context.commit &&
      values.running === "true" &&
      command?.includes("dist/apps/worker/src/main.js") &&
      compiled &&
      Object.values(compiled).every((v) => v === true),
  },
];
const inheritedArtifacts = [];
for (const id of ["JOB-05", "JOB-06"]) {
  const receipt = candidates
    .filter(
      (r) =>
        r.caseId === id &&
        r.commit === context.commit &&
        r.configHash === context.configHash &&
        !r.dirty,
    )
    .sort((a, b) => Date.parse(b.executedAt) - Date.parse(a.executedAt))[0];
  const valid =
    receipt?.status === "PASS" &&
    receipt.exitCode === 0 &&
    receipt.assertions?.length > 0 &&
    receipt.assertions.every((a) => a.passed) &&
    receipt.artifacts?.length > 0 &&
    (await Promise.all(receipt.artifacts.map((a) => verifyArtifact(a)))).every(
      Boolean,
    );
  assertions.push({
    name: id + " real PostgreSQL controlled-clock acceptance",
    expected:
      "same clean source/config with passing assertions and intact artifacts",
    actual: {
      runId: receipt?.runId,
      executedAt: receipt?.executedAt,
      status: receipt?.status,
    },
    passed: !!valid,
  });
  if (valid) inheritedArtifacts.push(...receipt.artifacts);
}
const source = await readFile(fileURLToPath(import.meta.url));
const passed = assertions.every((a) => a.passed),
  report = {
    runId,
    ...context,
    executedAt,
    scope:
      "Production worker configuration and compiled scheduler hooks, combined with real PostgreSQL controlled-clock reminder/expiry/daily-report tests. Does not claim a nightly production report has already run when no business day is due.",
    collectorSourceSha256: digest(source),
    assertions,
  };
await mkdir("harness/reports/artifacts", { recursive: true });
const path = `harness/reports/artifacts/${runId}-scheduler.json`,
  sourcePath = `harness/reports/artifacts/${runId}-scheduler-source.mjs`,
  bytes = Buffer.from(JSON.stringify(report, null, 2));
await writeFile(path, bytes);
await writeFile(sourcePath, source);
const artifacts = [
  { path, bytes: bytes.length, sha256: digest(bytes) },
  { path: sourcePath, bytes: source.length, sha256: digest(source) },
  ...new Map(inheritedArtifacts.map((a) => [a.path, a])).values(),
];
await writeFile(
  `harness/reports/receipts/${runId}-scheduler.json`,
  JSON.stringify(
    {
      ...report,
      caseId: "GATE-production-scheduler",
      status: passed ? "PASS" : "FAIL",
      exitCode: passed ? 0 : 1,
      command: [
        "node",
        relative(process.cwd(), fileURLToPath(import.meta.url)),
      ],
      artifacts,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ status: passed ? "PASS" : "FAIL", assertions }));
if (!passed) process.exitCode = 1;
