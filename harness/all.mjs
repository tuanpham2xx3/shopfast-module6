import "dotenv/config";
import { spawn } from "node:child_process";
const profiles = [
  "preflight",
  "ci",
  "deploy-rollback",
  "providers",
  "staging",
  "resilience",
  "backup-restore",
  "performance",
  "report",
];
let failures = 0;
for (const profile of profiles) {
  console.log(`\n=== ShopFast harness: ${profile} ===`);
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, ["harness/run.mjs", profile], {
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
