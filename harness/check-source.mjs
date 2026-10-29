import { readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const files = (await readdir("harness", { recursive: true }))
  .filter((file) => !file.startsWith("reports") && /\.(mjs|cjs)$/.test(file))
  .sort();
for (const file of files)
  execFileSync(process.execPath, ["--check", "harness/" + file], {
    stdio: "inherit",
  });
console.log(
  `Parsed ${files.length} harness source files without executing cloud/provider actions`,
);
