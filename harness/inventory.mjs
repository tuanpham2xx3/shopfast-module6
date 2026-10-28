import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { assessRequirements } from "./evidence.mjs";
const registry = JSON.parse(
  await readFile("harness/requirements.json", "utf8"),
);
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const result = await assessRequirements({
  registry,
  receipts: [],
  commit,
  configHash: "inventory-only",
});
await mkdir("harness/reports", { recursive: true });
await writeFile(
  "harness/reports/requirements-inventory.json",
  JSON.stringify({ commit, ...result }, null, 2),
);
console.log(
  JSON.stringify({
    status: result.status,
    requirements: registry.requirements.length,
    cases: registry.cases.length,
    notRun: result.results.filter((r) => r.status === "NOT_RUN").length,
    reason:
      "Inventory validates coverage only; it never imports historical PASS automatically",
  }),
);
if (result.status !== "PASS") process.exitCode = 1;
