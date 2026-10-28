import { spawn } from "node:child_process";
export async function runCommand(
  command,
  args,
  { env = process.env, timeoutMs = 600000 } = {},
) {
  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn(command, args, {
      env,
      stdio: ["ignore", "ignore", "ignore"],
      shell: false,
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    child.on("error", () => {
      clearTimeout(timer);
      resolve({
        status: "FAIL",
        reason: "SPAWN_FAILED",
        durationMs: Date.now() - start,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        status: !timedOut && code === 0 ? "PASS" : "FAIL",
        exitCode: code,
        timedOut,
        durationMs: Date.now() - start,
      });
    });
  });
}
export function aggregate(cases) {
  return cases.length && cases.every((c) => c.status === "PASS")
    ? "PASS"
    : cases.some((c) => c.status === "FAIL")
      ? "FAIL"
      : "BLOCKED";
}
export function assertFixture(name) {
  if (!/^harness_[a-z0-9_]{8,50}$/.test(name ?? ""))
    throw new Error("Explicit harness fixture database required");
  return name;
}
