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
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let output = "";
    const append = (chunk) => {
      output = (output + chunk.toString()).slice(-12000);
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    const safeOutput = () => {
      let sanitized = output;
      for (const [name, value] of Object.entries(env)) {
        if (
          value &&
          value.length >= 8 &&
          /KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL|REDIS_URL/.test(name)
        )
          sanitized = sanitized.split(value).join("[REDACTED]");
      }
      return sanitized
        .replace(/postgres(?:ql)?:\/\/[^\s"']+/g, "[REDACTED_DATABASE_URL]")
        .slice(-4000);
    };
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
        output: safeOutput(),
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        status: !timedOut && code === 0 ? "PASS" : "FAIL",
        exitCode: code,
        timedOut,
        durationMs: Date.now() - start,
        output: safeOutput(),
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
