import { spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
console.log(`Node: ${process.version}`);
for (const [name, args] of [
  ["git", ["--version"]],
  ["docker", ["compose", "version"]],
  ["docker", ["info", "--format", "{{.ServerVersion}}"]],
]) {
  const result = spawnSync(name, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 10000,
  });
  console.log(
    `${name} ${args[0]}: ${result.status === 0 ? result.stdout.trim() : "UNAVAILABLE"}`,
  );
}
for (const name of [
  "GEMINI_API_KEY",
  "CONTEXT7_API_KEY",
  "DATABASE_URL",
  "REDIS_URL",
]) {
  console.log(
    `${name}: ${process.env[name] ? "SET (value hidden)" : "NOT SET in this process"}`,
  );
}
for (const name of ["js-genai", "bullmq"]) {
  try {
    await access(`${root}/tools/references/${name}/.git`);
    console.log(`Reference ${name}: present`);
  } catch {
    console.log(`Reference ${name}: missing`);
  }
}
console.log(
  "Application target from SRS: Node 20; this tooling check does not change the active system Node version.",
);
