import "dotenv/config";
import { execFileSync, spawnSync } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { digest } from "./evidence.mjs";
import { harnessContext } from "./context.mjs";
const context = harnessContext(),
  runId = randomUUID(),
  executedAt = new Date().toISOString();
const keys = Object.entries(process.env)
  .filter(
    ([name, value]) =>
      /KEY|TOKEN|SECRET|PASSWORD/.test(name) && value?.length >= 16,
  )
  .map(([, value]) => Buffer.from(value));
const objects = execFileSync("git", ["rev-list", "--objects", "--all"], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
})
  .trim()
  .split("\n")
  .map((line) => line.split(" ")[0]);
const batch = spawnSync("git", ["cat-file", "--batch"], {
  input: objects.join("\n") + "\n",
  maxBuffer: 256 * 1024 * 1024,
});
if (batch.status !== 0) throw Error("Git history archive could not be read");
let offset = 0,
  blobs = 0,
  findings = 0;
const generic =
  /\bAIza[0-9A-Za-z_-]{30,}|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/=]{20}/;
while (offset < batch.stdout.length) {
  const end = batch.stdout.indexOf(10, offset);
  if (end < 0) throw Error("Malformed git batch header");
  const [, type, size] = batch.stdout
    .subarray(offset, end)
    .toString()
    .split(" ");
  const length = Number(size);
  if (!Number.isSafeInteger(length)) throw Error("Missing git history object");
  const body = batch.stdout.subarray(end + 1, end + 1 + length);
  if (type === "blob") {
    blobs++;
    if (keys.some((key) => body.includes(key)) || generic.test(body.toString()))
      findings++;
  }
  offset = end + length + 2;
}
const remote = spawnSync(
  "ssh",
  [
    "-o",
    "BatchMode=yes",
    "-i",
    ".secrets/shopfast-ec2.pem",
    "ubuntu@3.27.169.177",
    "sudo python3 -",
  ],
  {
    input:
      "PUBLIC_TEST_KEYS = " +
      JSON.stringify(
        JSON.parse(
          await readFile("harness/public-test-key-allowlist.json", "utf8"),
        ),
      ) +
      "\n" +
      (await readFile("harness/image-secrets.py", "utf8")),
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 1024 * 1024,
  },
);
let images;
try {
  images = JSON.parse(remote.stdout.trim());
} catch {
  images = { status: "FAIL", reason: "No valid remote scan report" };
}
const assertions = [
  {
    name: "full reachable git object scan",
    expected:
      "all readable objects; zero known-secret or credential-format findings",
    actual: {
      objects: objects.length,
      blobs,
      configuredValues: keys.length,
      findings,
    },
    passed: blobs > 0 && keys.length > 0 && findings === 0,
  },
  {
    name: "release app/web image archive scan",
    expected: "both image archives, including compressed layers; zero findings",
    actual: images,
    passed:
      remote.status === 0 &&
      images.status === "PASS" &&
      images.images === 2 &&
      images.archiveMembers > 0 &&
      images.selfTests >= 6 &&
      images.findings === 0,
  },
];
const passed = assertions.every((a) => a.passed),
  report = {
    runId,
    ...context,
    executedAt,
    targetCommit: images.targetCommit,
    scope:
      "Known configured values and credential formats in reachable Git blobs and full Docker app/web archives. Includes compiled browser assets and deleted lower-layer contents; does not claim detection of every unknown secret format.",
    assertions,
  };
const bytes = Buffer.from(JSON.stringify(report, null, 2)),
  path = `harness/reports/artifacts/${runId}-secret-audit.json`;
await mkdir("harness/reports/artifacts", { recursive: true });
await mkdir("harness/reports/receipts", { recursive: true });
await writeFile(path, bytes);
await writeFile(
  `harness/reports/receipts/${runId}-secrets.json`,
  JSON.stringify(
    {
      ...report,
      caseId: "GATE-secret-history-image-bundle",
      status: passed ? "PASS" : "FAIL",
      exitCode: passed ? 0 : 1,
      command: ["node", "harness/secret-audit.mjs"],
      artifacts: [{ path, bytes: bytes.length, sha256: digest(bytes) }],
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({ status: passed ? "PASS" : "FAIL", blobs, findings, images }),
);
if (!passed) process.exitCode = 1;
