import "dotenv/config";
import { readFile, mkdir, writeFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { lookup } from "node:dns/promises";
import { createHash } from "node:crypto";
import { runCommand, aggregate } from "./core.mjs";
const profile = process.argv[2] ?? "preflight";
const directory = "harness/reports";
await mkdir(directory, { recursive: true });
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const cases = [];
const dirty = !!execFileSync("git", ["status", "--porcelain"], {
  encoding: "utf8",
}).trim();
const configHash = createHash("sha256")
  .update(
    JSON.stringify({
      target: "https://shopfast.tuanpq.com",
      model: process.env.GEMINI_MODEL,
      live: process.env.HARNESS_LIVE_PROVIDERS === "true",
      databaseConfigured: !!process.env.TEST_DATABASE_URL,
      redisConfigured: !!process.env.TEST_REDIS_URL,
    }),
  )
  .digest("hex");
const add = (id, status, details = {}) => {
  cases.push({ id, status, ...details });
  console.log(`${id}: ${status}`);
};
const command = async (id, args, env = process.env) => {
  const result = await runCommand(process.execPath, args, { env });
  add(id, result.status, { ...result, command: ["node", ...args] });
};
const blocked = (id, reason) => add(id, "BLOCKED", { reason });
const required = (keys, id) => {
  const absent = keys.filter((k) => !process.env[k]);
  if (absent.length) {
    blocked(id, `Missing configuration: ${absent.join(",")}`);
    return false;
  }
  return true;
};
const target = "https://shopfast.tuanpq.com";
async function staging() {
  try {
    const health = await fetch(target + "/api/v1/health/live", {
      signal: AbortSignal.timeout(15000),
    });
    add("OPS-01-HTTPS-LIVE", health.ok ? "PASS" : "FAIL", {
      httpStatus: health.status,
    });
    const redirect = await fetch(target.replace("https:", "http:"), {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    add(
      "SEC-HTTPS-REDIRECT",
      [301, 308].includes(redirect.status) &&
        redirect.headers.get("location")?.startsWith(target)
        ? "PASS"
        : "FAIL",
    );
  } catch {
    add("OPS-01-HTTPS-LIVE", "FAIL", {
      reason: "HTTPS target unavailable or certificate invalid",
    });
  }
}
switch (profile) {
  case "preflight": {
    await command("SECRETS-SCAN", ["harness/secrets.mjs"]);
    for (const p of ["deploy/compose.infra.yml", ".secrets/shopfast-ec2.pem"]) {
      try {
        await readFile(p);
        add(p, "PASS");
      } catch {
        blocked(p, "Required file missing");
      }
    }
    try {
      const answer = await lookup("shopfast.tuanpq.com");
      add("DNS", answer.address === "3.27.169.177" ? "PASS" : "FAIL");
    } catch {
      add("DNS", "FAIL");
    }
    for (const name of ["GEMINI_API_KEY", "RESEND_API_KEY", "EMAIL_TEST_TO"]) {
      add(name, process.env[name] ? "PASS" : "BLOCKED");
    }
    break;
  }
  case "ci":
    await command("HARNESS-SELFTEST", ["--test", "harness/core.test.mjs"]);
    await command("FORMAT", [
      "node_modules/prettier/bin/prettier.cjs",
      "--check",
      "{apps,libs,database,tests,scripts}/**/*.{ts,tsx,js,json}",
      "*.{json,js}",
    ]);
    await command("LINT", [
      "node_modules/eslint/bin/eslint.js",
      "{apps,libs,database,tests,scripts}/**/*.{ts,tsx}",
    ]);
    await command("TYPECHECK", ["node_modules/typescript/bin/tsc", "--noEmit"]);
    await command("UNIT", ["node_modules/jest/bin/jest.js", "--runInBand"]);
    await command("UNIT-BUSINESS-COVERAGE", [
      "node_modules/jest/bin/jest.js",
      "--config",
      "jest.unit-business.config.js",
      "--runInBand",
    ]);
    await command("BUILD-API", [
      "node_modules/@nestjs/cli/bin/nest.js",
      "build",
      "api",
    ]);
    await command("BUILD-WORKER", [
      "node_modules/@nestjs/cli/bin/nest.js",
      "build",
      "worker",
    ]);
    await command("TYPECHECK-WEB", [
      "node_modules/typescript/bin/tsc",
      "--build",
      "apps/web/tsconfig.json",
    ]);
    await command("BUILD-WEB", [
      "node_modules/vite/bin/vite.js",
      "build",
      "apps/web",
    ]);
    if (required(["TEST_DATABASE_URL", "TEST_REDIS_URL"], "INTEGRATION"))
      await command("INTEGRATION-COVERAGE", [
        "node_modules/jest/bin/jest.js",
        "--config",
        "jest.business.config.js",
        "--runInBand",
      ]);
    if (required(["TEST_DATABASE_URL"], "BROWSER-E2E"))
      await command("BROWSER-E2E", [
        "node_modules/@playwright/test/cli.js",
        "test",
      ]);
    break;
  case "staging":
    await staging();
    if (required(["EMAIL_TEST_TO", "RESEND_API_KEY"], "STAGING-FULL"))
      await command("STAGING-FULL", ["harness/staging.mjs"]);
    break;
  case "providers":
    if (process.env.HARNESS_LIVE_PROVIDERS !== "true")
      blocked(
        "PROVIDERS",
        "Set HARNESS_LIVE_PROVIDERS=true to authorize live calls to configured test inbox/model",
      );
    else {
      if (
        required(
          ["GEMINI_API_KEY", "GEMINI_MODEL", "TEST_DATABASE_URL"],
          "AI-01",
        )
      )
        await command(
          "AI-01",
          ["node_modules/ts-node/dist/bin.js", "scripts/gemini-agent-smoke.ts"],
          {
            ...process.env,
            GEMINI_AGENT_REPORT_PATH: `${directory}/gemini-agent.json`,
          },
        );
      if (required(["RESEND_API_KEY", "EMAIL_TEST_TO"], "JOB-EMAIL"))
        await command(
          "JOB-EMAIL",
          ["node_modules/ts-node/dist/bin.js", "scripts/resend-smoke.ts"],
          {
            ...process.env,
            RESEND_SMOKE_REPORT_PATH: `${directory}/resend.json`,
          },
        );
    }
    break;
  case "resilience":
    if (required(["TEST_DATABASE_URL", "TEST_REDIS_URL"], "RESILIENCE"))
      await command("TRANSACTIONS-RECOVERY", [
        "node_modules/jest/bin/jest.js",
        "--config",
        "jest.integration.config.js",
        "--runInBand",
      ]);
    add(
      "WORKER-PROCESS-CRASH",
      (
        await runCommand("ssh", [
          "-o",
          "BatchMode=yes",
          "-i",
          ".secrets/shopfast-ec2.pem",
          "ubuntu@3.27.169.177",
          "sudo bash /opt/shopfast/resilience.sh",
        ])
      ).status,
    );
    break;
  case "performance":
    add(
      "PERFORMANCE",
      (
        await runCommand(
          "ssh",
          [
            "-o",
            "BatchMode=yes",
            "-i",
            ".secrets/shopfast-ec2.pem",
            "ubuntu@3.27.169.177",
            "sudo bash /opt/shopfast/performance.sh",
          ],
          { timeoutMs: 1500000 },
        )
      ).status,
    );
    break;
  case "backup-restore":
    add(
      "BACKUP-RESTORE",
      (
        await runCommand("ssh", [
          "-o",
          "BatchMode=yes",
          "-i",
          ".secrets/shopfast-ec2.pem",
          "ubuntu@3.27.169.177",
          "sudo bash /opt/shopfast/backup.sh && sudo bash /opt/shopfast/restore-rehearsal.sh",
        ])
      ).status,
    );
    break;
  case "deploy-rollback":
    if (!/^[0-9a-f]{40}$/.test(process.env.HARNESS_CANDIDATE_SHA ?? ""))
      blocked(
        "DEPLOY-ROLLBACK",
        "Set HARNESS_CANDIDATE_SHA to a built image commit different from active release",
      );
    else
      add(
        "DEPLOY-ROLLBACK",
        (
          await runCommand("ssh", [
            "-o",
            "BatchMode=yes",
            "-i",
            ".secrets/shopfast-ec2.pem",
            "ubuntu@3.27.169.177",
            `sudo bash /opt/shopfast/rollback-rehearsal.sh ${process.env.HARNESS_CANDIDATE_SHA}`,
          ])
        ).status,
      );
    break;
  case "report": {
    if (dirty)
      blocked(
        "WORKTREE",
        "Uncommitted changes; commit the tested source before final acceptance",
      );
    const latest = new Map();
    for (const file of await readdir(directory)) {
      if (!file.endsWith(".json")) continue;
      const report = JSON.parse(await readFile(`${directory}/${file}`, "utf8"));
      if (
        report.commit === commit &&
        !report.dirty &&
        report.configHash === configHash &&
        report.profile !== "report"
      ) {
        const old = latest.get(report.profile);
        if (!old || report.executedAt > old.executedAt)
          latest.set(report.profile, { ...report, file });
      }
    }
    for (const required of [
      "preflight",
      "ci",
      "staging",
      "providers",
      "resilience",
      "performance",
      "backup-restore",
      "deploy-rollback",
    ]) {
      const report = latest.get(required);
      if (report) add(required, report.status, { source: report.file });
      else blocked(required, "No matching commit/config run");
    }
    break;
  }
  default:
    throw new Error("Unknown harness profile");
}
const result = {
  runId: `${Date.now()}-${profile}`,
  profile,
  commit,
  dirty,
  configHash,
  executedAt: new Date().toISOString(),
  status: aggregate(cases),
  cases,
};
await writeFile(
  `${directory}/${result.runId}.json`,
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  `${profile}: ${result.status}; ${cases.length} cases; report ${directory}/${result.runId}.json`,
);
if (result.status !== "PASS") process.exitCode = 1;
