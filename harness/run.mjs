import "dotenv/config";
import { readFile, mkdir, writeFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { lookup } from "node:dns/promises";
import { runCommand, aggregate } from "./core.mjs";
const profile = process.argv[2] ?? "preflight";
const directory = "harness/reports";
await mkdir(directory, { recursive: true });
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const cases = [];
const add = (id, status, details = {}) => {
  cases.push({ id, status, ...details });
  console.log(`${id}: ${status}`);
};
const command = async (id, args, env = process.env) => {
  add(id, (await runCommand(process.execPath, args, { env })).status);
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
    if (required(["TEST_DATABASE_URL", "TEST_REDIS_URL"], "INTEGRATION"))
      await command("INTEGRATION-COVERAGE", [
        "node_modules/jest/bin/jest.js",
        "--config",
        "jest.business.config.js",
        "--runInBand",
      ]);
    break;
  case "staging":
    await staging();
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
        await command("AI-01", [
          "node_modules/ts-node/dist/bin.js",
          "scripts/gemini-agent-smoke.ts",
        ]);
      if (required(["RESEND_API_KEY", "EMAIL_TEST_TO"], "JOB-EMAIL"))
        await command("JOB-EMAIL", [
          "node_modules/ts-node/dist/bin.js",
          "scripts/resend-smoke.ts",
        ]);
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
    blocked(
      "HOST-FAILURE",
      "Live isolated crash/restart rehearsal not implemented yet; integration tests alone cannot pass host acceptance",
    );
    break;
  case "performance":
    blocked(
      "PERFORMANCE",
      "Full docs08 dataset/load profile not implemented yet; no latency/capacity acceptance",
    );
    break;
  case "backup-restore":
    blocked(
      "BACKUP-RESTORE",
      "Off-host backup and isolated restore not configured yet",
    );
    break;
  case "deploy-rollback":
    blocked(
      "DEPLOY-ROLLBACK",
      "Release/rollback automation not configured yet",
    );
    break;
  case "report": {
    for (const file of await readdir(directory)) {
      if (!file.endsWith(".json")) continue;
      const report = JSON.parse(await readFile(`${directory}/${file}`, "utf8"));
      if (report.commit === commit && report.profile !== "report")
        add(report.profile, report.status, { source: file });
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
