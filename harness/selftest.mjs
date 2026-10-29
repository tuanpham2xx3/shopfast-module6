import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
const files = (await readdir("harness/tests"))
  .filter((file) => file.endsWith(".test.mjs"))
  .sort()
  .map((file) => "harness/tests/" + file);
if (!files.length) throw Error("No harness self-tests discovered");
const result = spawnSync(process.execPath, ["--test", ...files], {
  stdio: "inherit",
});
process.exitCode = result.status ?? 1;
