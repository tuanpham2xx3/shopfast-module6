import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
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
      output += chunk.toString();
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
      return sanitized.replace(
        /postgres(?:ql)?:\/\/[^\s"']+/g,
        "[REDACTED_DATABASE_URL]",
      );
    };
    let finished = false;
    const finish = async (result) => {
      if (finished) return;
      finished = true;
      const captured = safeOutput();
      const content =
        JSON.stringify(
          {
            startedAt: new Date(start).toISOString(),
            finishedAt: new Date().toISOString(),
            ...result,
            output: captured,
          },
          null,
          2,
        ) + "\n";
      const path = `harness/reports/artifacts/${randomUUID()}.log`;
      try {
        await mkdir("harness/reports/artifacts", { recursive: true });
        await writeFile(path, content);
        resolve({
          ...result,
          output: captured.slice(-4000),
          artifact: {
            path,
            sha256: createHash("sha256").update(content).digest("hex"),
            bytes: Buffer.byteLength(content),
          },
        });
      } catch {
        resolve({ ...result, status: "FAIL", reason: "EVIDENCE_WRITE_FAILED" });
      }
    };
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    child.on("error", () => {
      clearTimeout(timer);
      void finish({
        status: "FAIL",
        reason: "SPAWN_FAILED",
        durationMs: Date.now() - start,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      void finish({
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
