import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { harnessContext } from "./context.mjs";
import { digest } from "./evidence.mjs";
const context = harnessContext(),
  runId = randomUUID(),
  executedAt = new Date().toISOString();
const script = `set -euo pipefail
cd /opt/shopfast
sha=$(node_not_needed=1; cat release.json | python3 -c 'import sys,json; print(json.load(sys.stdin)["commit"])')
api="shopfast-api-$sha"
printf 'release\\t'; cat release.json; printf '\\n'
printf 'node\\t'; docker exec "$api" node --version
printf 'nest\\t'; docker exec "$api" node -p "require('@nestjs/core/package.json').version"
printf 'postgres\\t'; docker exec shopfast-postgres-1 postgres --version
printf 'redis\\t'; docker exec shopfast-redis-1 redis-server --version
printf 'postgresPort\\t'; docker port shopfast-postgres-1 5432
printf 'redisPort\\t'; docker port shopfast-redis-1 6379
printf 'apiUser\\t'; docker inspect -f '{{.Config.User}}' "$api"
printf 'apiImage\\t'; docker inspect -f '{{.Config.Image}}' "$api"
printf 'apiImageId\\t'; docker inspect -f '{{.Image}}' "$api"
printf 'taggedImageId\\t'; docker image inspect -f '{{.Id}}' "ghcr.io/tuanpham2xx3/shopfast-module6-app:$sha"
printf 'backupEnabled\\t'; systemctl is-enabled shopfast-backup.timer
printf 'backupActive\\t'; systemctl is-active shopfast-backup.timer
printf 'backupAgeSeconds\\t'; python3 -c 'import os,time; print(int(time.time()-os.path.getmtime("backups/last-success")))'
printf 'backupCalendar\\t'; systemctl cat shopfast-backup.timer | grep '^OnCalendar='
printf 'composeConfig\\t'; docker compose -f compose.infra.yml -f compose.app.yml config --quiet >/dev/null && printf 'valid\\n'
printf 'workerImageId\\t'; docker inspect -f '{{.Image}}' "shopfast-worker-$sha"
printf 'webRelease\\t'; readlink releases/current
printf 'webAssetsHash\\t'; (cd "releases/$sha/web"; find . -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1)
printf 'taggedWebAssetsHash\\t'; docker run --rm --network none --entrypoint sh "ghcr.io/tuanpham2xx3/shopfast-module6-web:$sha" -c "cd /usr/share/nginx/html; find . -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1"
printf 'offhostBackup\\t'; /opt/shopfast/aws-venv/bin/aws s3api list-objects-v2 --bucket shopfast-backups-321323528839-ap-southeast-2 --prefix backups/ --region ap-southeast-2 --output json | python3 -c 'import sys,json,datetime; x=[o for o in json.load(sys.stdin).get("Contents",[]) if o["Key"].endswith(".dump")]; o=max(x,key=lambda o:o["LastModified"]); print(json.dumps({"ageSeconds":(datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(o["LastModified"].replace("Z","+00:00"))).total_seconds(),"bytes":o["Size"]}))'
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
  {
    input: script,
    encoding: "utf8",
    timeout: 45000,
    stdio: ["pipe", "pipe", "pipe"],
  },
);
const values = Object.fromEntries(
  (remote.stdout ?? "")
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.includes("\t"))
    .map((l) => {
      const i = l.indexOf("\t");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const assertions = [];
const check = (name, expected, actual, passed) =>
  assertions.push({ name, expected, actual, passed });
check("snapshot command exit", 0, remote.status, remote.status === 0);
check("Node runtime", "v20.x", values.node, /^v20\./.test(values.node ?? ""));
check("Nest runtime", "10.x", values.nest, /^10\./.test(values.nest ?? ""));
check(
  "PostgreSQL runtime",
  "16.x",
  values.postgres,
  /PostgreSQL\) 16\./.test(values.postgres ?? ""),
);
check("Redis runtime", "7.x", values.redis, /v=7\./.test(values.redis ?? ""));
for (const field of ["postgresPort", "redisPort"])
  check(
    field,
    "loopback only",
    values[field],
    /^127\.0\.0\.1:\d+$/.test(values[field] ?? ""),
  );
check("API nonroot user", "node", values.apiUser, values.apiUser === "node");
let manifest;
try {
  manifest = JSON.parse(values.release);
} catch {}
check(
  "commit-pinned image",
  "SHA-tagged image and running container match the immutable release image ID",
  {
    image: values.apiImage,
    runningId: values.apiImageId,
    taggedId: values.taggedImageId,
    releaseId: manifest?.appImageId,
  },
  !!manifest &&
    values.apiImageId === manifest.appImageId &&
    values.taggedImageId === manifest.appImageId &&
    (values.apiImage?.endsWith(":" + manifest.commit) ||
      /@sha256:[a-f0-9]{64}$/.test(values.apiImage ?? "")),
);
check(
  "daily backup timer",
  "enabled/active/19:00UTC",
  `${values.backupEnabled}/${values.backupActive}/${values.backupCalendar}`,
  values.backupEnabled === "enabled" &&
    values.backupActive === "active" &&
    values.backupCalendar === "OnCalendar=*-*-* 19:00:00 UTC",
);
check(
  "backup freshness",
  "last success within 27h",
  Number(values.backupAgeSeconds),
  Number(values.backupAgeSeconds) >= 0 &&
    Number(values.backupAgeSeconds) < 27 * 3600,
);
let offhost;
try {
  offhost = JSON.parse(values.offhostBackup);
} catch {}
check(
  "fresh S3 backup",
  "nonempty off-host dump uploaded within 27h",
  offhost,
  offhost?.bytes > 0 &&
    offhost?.ageSeconds >= 0 &&
    offhost.ageSeconds < 27 * 3600,
);
check(
  "Linux Compose release images",
  "valid Compose, matching API/worker image IDs and web assets matching the SHA-tagged image",
  {
    config: values.composeConfig,
    worker: values.workerImageId,
    webRelease: values.webRelease,
    webAssetsHash: values.webAssetsHash,
    taggedWebAssetsHash: values.taggedWebAssetsHash,
  },
  values.composeConfig === "valid" &&
    !!manifest?.appImageId &&
    values.workerImageId === manifest.appImageId &&
    values.webRelease === manifest.commit &&
    /^[a-f0-9]{64}$/.test(values.webAssetsHash ?? "") &&
    values.webAssetsHash === values.taggedWebAssetsHash,
);
const document = await fetch("https://shopfast.tuanpq.com", {
  redirect: "manual",
  signal: AbortSignal.timeout(15000),
});
check(
  "live HTTPS UI",
  200,
  document.status,
  document.status === 200 && (await document.text()).includes("ShopFast"),
);
const redirect = await fetch("http://shopfast.tuanpq.com", {
  redirect: "manual",
  signal: AbortSignal.timeout(15000),
});
check(
  "HTTPS redirect",
  "301/308 to expected HTTPS origin",
  { status: redirect.status, location: redirect.headers.get("location") },
  [301, 308].includes(redirect.status) &&
    redirect.headers
      .get("location")
      ?.startsWith("https://shopfast.tuanpq.com/"),
);
const report = {
  runId,
  ...context,
  executedAt,
  targetCommit: manifest?.commit,
  status: assertions.every((a) => a.passed) ? "PASS" : "FAIL",
  assertions,
};
await mkdir("harness/reports/artifacts", { recursive: true });
const bytes = Buffer.from(JSON.stringify(report, null, 2)),
  path = `harness/reports/artifacts/${runId}-runtime.json`;
await writeFile(path, bytes);
await writeFile("harness/reports/runtime-audit.json", bytes);
await mkdir("harness/reports/receipts", { recursive: true });
for (const [gate, names] of Object.entries({
  "runtime-versions": [
    "Node runtime",
    "Nest runtime",
    "PostgreSQL runtime",
    "Redis runtime",
  ],
  "https-redirect": ["HTTPS redirect"],
  "https-live-url": ["live HTTPS UI"],
  "sha-digest-release": ["commit-pinned image"],
  "linux-compose-images": [
    "Linux Compose release images",
    "commit-pinned image",
  ],
  "daily-offhost-backup": [
    "daily backup timer",
    "backup freshness",
    "fresh S3 backup",
  ],
})) {
  const selected = assertions.filter((assertion) =>
    names.includes(assertion.name),
  );
  const passed =
    selected.length === names.length &&
    selected.every((assertion) => assertion.passed);
  await writeFile(
    `harness/reports/receipts/${runId}-${gate}.json`,
    JSON.stringify(
      {
        runId,
        caseId: "GATE-" + gate,
        ...context,
        executedAt,
        targetCommit: manifest?.commit,
        status: passed ? "PASS" : "FAIL",
        exitCode: passed ? 0 : 1,
        command: ["node", "harness/runtime-audit.mjs"],
        assertions: selected,
        artifacts: [{ path, bytes: bytes.length, sha256: digest(bytes) }],
      },
      null,
      2,
    ),
  );
}
console.log(
  JSON.stringify({
    status: report.status,
    passed: assertions.filter((a) => a.passed).length,
    total: assertions.length,
    targetCommit: manifest?.commit,
  }),
);
if (report.status !== "PASS") process.exitCode = 1;
