import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

const args = [
  "-o",
  "BatchMode=yes",
  "-o",
  "ConnectTimeout=3",
  "-i",
  ".secrets/shopfast-ec2.pem",
  "ubuntu@3.27.169.177",
];
const snapshotScript = `set -euo pipefail
cd /opt/shopfast
boot=$(cat /proc/sys/kernel/random/boot_id)
volumes=$(docker inspect shopfast-postgres-1 shopfast-redis-1 | jq -c '[.[].Mounts[] | select(.Type=="volume") | .Name] | sort')
counts=$(docker exec -i shopfast-postgres-1 psql -U shopfast -d shopfast -At <<'SQL'
SELECT json_build_object('users',(SELECT count(*) FROM users),'products',(SELECT count(*) FROM products),'orders',(SELECT count(*) FROM orders),'inventories',(SELECT count(*) FROM inventories));
SQL
)
jq -n --arg boot "$boot" --argjson volumes "$volumes" --argjson counts "$counts" --argjson release "$(cat release.json)" --argjson backupEpoch "$(stat -c %Y backups/last-success)" '{boot:$boot,volumes:$volumes,counts:$counts,commit:$release.commit,backupEpoch:$backupEpoch}'
`;
function ssh(command, input) {
  const r = spawnSync("ssh", [...args, command], {
    input,
    encoding: "utf8",
    timeout: 15000,
  });
  if (r.status !== 0) throw new Error("Host SSH/snapshot unavailable");
  return r.stdout;
}
let report = { status: "FAIL", executedAt: new Date().toISOString() };
try {
  assert.equal(
    process.env.HARNESS_REBOOT_HOST,
    "true",
    "Explicit reboot harness flag required",
  );
  const before = JSON.parse(ssh("sudo bash -s", snapshotScript));
  assert(
    Date.now() / 1000 - before.backupEpoch < 1800,
    "Fresh successful backup required before reboot",
  );
  const start = Date.now();
  // A reboot may close SSH before a response; prove the changed boot ID below.
  spawnSync("ssh", [...args, "sudo systemctl reboot"], {
    timeout: 10000,
    stdio: "ignore",
  });
  let after;
  while (Date.now() - start < 180000) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    try {
      const candidate = JSON.parse(ssh("sudo bash -s", snapshotScript));
      if (candidate.boot === before.boot) continue;
      const health = await fetch(
        "https://shopfast.tuanpq.com/api/v1/health/ready",
        { signal: AbortSignal.timeout(5000) },
      );
      if (!health.ok || (await health.json()).data?.status !== "ok") continue;
      after = candidate;
      break;
    } catch {
      /* bounded recovery polling */
    }
  }
  assert(after, "Host and HTTPS must recover within 180 seconds");
  assert.deepEqual(after.volumes, before.volumes);
  assert.deepEqual(after.counts, before.counts);
  assert.equal(after.commit, before.commit);
  report = {
    ...report,
    status: "PASS",
    durationSeconds: (Date.now() - start) / 1000,
    bootChanged: true,
    volumesPreserved: true,
    countsMatched: true,
    commit: after.commit,
    httpsReady: true,
  };
  console.log(
    "Host reboot: boot changed, named volumes/data/release preserved, HTTPS ready",
  );
} catch (e) {
  report.reason = e.message;
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await writeFile(
    "harness/reports/host-restart.json",
    JSON.stringify(report, null, 2) + "\n",
  );
}
