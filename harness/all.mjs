import "dotenv/config";
import { spawn } from "node:child_process";
const profiles = [
  "preflight",
  "ci",
  { name: "platform-evidence", script: "harness/suites/platform-cases.mjs" },
  { name: "runtime-evidence", script: "harness/collectors/runtime-audit.mjs" },
  {
    name: "scheduler-evidence",
    script: "harness/collectors/scheduler-audit.mjs",
  },
  {
    name: "secret-history-images",
    script: "harness/collectors/secret-audit.mjs",
  },
  { name: "cloud-audit", script: "harness/collectors/cloud-audit.mjs" },
  {
    name: "delivery-evidence",
    script: "harness/collectors/delivery-audit.mjs",
  },
  "deploy-rollback",
  "providers",
  "staging",
  {
    name: "staging-components",
    script: "harness/collectors/staging-components.mjs",
  },
  {
    name: "active-deploy-continuity",
    script: "harness/suites/deploy-continuity.mjs",
  },
  "resilience",
  "backup-restore",
  "performance",
  {
    name: "published-evidence",
    script: "harness/collectors/published-artifacts.mjs",
  },
  "report",
];
let failures = 0;
for (const profile of profiles) {
  const name = typeof profile === "string" ? profile : profile.name;
  const args =
    typeof profile === "string"
      ? ["harness/run.mjs", profile]
      : [profile.script];
  console.log(`\n=== ShopFast harness: ${name} ===`);
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", () => resolve(1));
    child.once("exit", (code) => resolve(code ?? 1));
  });
  if (code !== 0) failures++;
}
console.log(
  `Harness finished with ${failures} non-passing profiles. See harness/reports/summary.md`,
);
if (failures) process.exitCode = 1;
