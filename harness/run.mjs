import "dotenv/config";
import { readFile, mkdir, writeFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { lookup } from "node:dns/promises";
import { harnessContext } from "./context.mjs";
import { runCommand, aggregate } from "./core.mjs";
import { assessRequirements, verifyArtifact } from "./evidence.mjs";
import { deriveRequirements } from "./derive.mjs";
const profile = process.argv[2] ?? "preflight";
const directory = "harness/reports";
await mkdir(directory, { recursive: true });
const { commit, dirty, configHash } = harnessContext();
const cases = [];
const add = (id, status, details = {}) => {
  if (typeof status === "object") {
    details = { ...status, ...details };
    status = status.status;
  }
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
    await command("HARNESS-SELFTEST", [
      "--test",
      "harness/core.test.mjs",
      "harness/evidence.test.mjs",
    ]);
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
    await command("STAGING-BROWSER-ROLES", ["harness/browser-roles.cjs"]);
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
      if (
        required(
          ["RESEND_API_KEY", "EMAIL_TEST_TO", "TEST_DATABASE_URL"],
          "JOB-EMAIL-CRASH",
        )
      )
        await command("JOB-EMAIL-CRASH", [
          "node_modules/ts-node/dist/bin.js",
          "scripts/resend-crash-smoke.ts",
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
    add(
      "WORKER-PROCESS-CRASH",
      await runCommand("ssh", [
        "-o",
        "BatchMode=yes",
        "-i",
        ".secrets/shopfast-ec2.pem",
        "ubuntu@3.27.169.177",
        "sudo bash /opt/shopfast/resilience.sh",
      ]),
    );
    add(
      "REDIS-PROCESS-OUTAGE",
      await runCommand("ssh", [
        "-o",
        "BatchMode=yes",
        "-i",
        ".secrets/shopfast-ec2.pem",
        "ubuntu@3.27.169.177",
        "sudo bash /opt/shopfast/redis-outage.sh",
      ]),
    );
    break;
  case "performance":
    add(
      "PERFORMANCE",
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
      ),
    );
    break;
  case "backup-restore":
    add(
      "BACKUP-RESTORE",
      await runCommand("ssh", [
        "-o",
        "BatchMode=yes",
        "-i",
        ".secrets/shopfast-ec2.pem",
        "ubuntu@3.27.169.177",
        "sudo bash /opt/shopfast/backup.sh && sudo bash /opt/shopfast/restore-rehearsal.sh",
      ]),
    );
    if (process.env.HARNESS_REBOOT_HOST === "true")
      await command("HOST-RESTART", ["harness/host-restart.mjs"]);
    else
      blocked(
        "HOST-RESTART",
        "Set HARNESS_REBOOT_HOST=true for the authorized EC2 reboot rehearsal",
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
        await runCommand("ssh", [
          "-o",
          "BatchMode=yes",
          "-i",
          ".secrets/shopfast-ec2.pem",
          "ubuntu@3.27.169.177",
          `sudo bash /opt/shopfast/rollback-rehearsal.sh ${process.env.HARNESS_CANDIDATE_SHA} && sudo bash /opt/shopfast/deploy-release.sh ${process.env.HARNESS_CANDIDATE_SHA}`,
        ]),
      );
    break;
  case "report": {
    await deriveRequirements({ commit, dirty, configHash });
    if (dirty)
      blocked(
        "WORKTREE",
        "Uncommitted changes; commit the tested source before final acceptance",
      );
    try {
      const deployed = JSON.parse(
        execFileSync(
          "ssh",
          [
            "-o",
            "BatchMode=yes",
            "-i",
            ".secrets/shopfast-ec2.pem",
            "ubuntu@3.27.169.177",
            "cat /opt/shopfast/release.json",
          ],
          {
            encoding: "utf8",
            timeout: 15000,
            stdio: ["ignore", "pipe", "pipe"],
          },
        ),
      );
      add("DEPLOYED-COMMIT", deployed.commit === commit ? "PASS" : "FAIL", {
        deployedCommit: deployed.commit,
      });
    } catch {
      blocked("DEPLOYED-COMMIT", "No verified release manifest on target");
    }
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
      if (report) {
        const artifacts = report.cases.map((c) => c.artifact).filter(Boolean);
        const valid = (
          await Promise.all(artifacts.map((a) => verifyArtifact(a)))
        ).every(Boolean);
        add(required, valid ? report.status : "FAIL", {
          source: report.file,
          ...(valid ? {} : { reason: "Profile artifact integrity failed" }),
        });
      } else blocked(required, "No matching commit/config run");
    }
    const registry = JSON.parse(
      await readFile("harness/requirements.json", "utf8"),
    );
    const receipts = [];
    await mkdir(`${directory}/receipts`, { recursive: true });
    for (const file of await readdir(`${directory}/receipts`)) {
      if (!file.endsWith(".json")) continue;
      const receipt = JSON.parse(
        await readFile(`${directory}/receipts/${file}`, "utf8"),
      );
      receipts.push(...(Array.isArray(receipt) ? receipt : [receipt]));
    }
    const assessment = await assessRequirements({
      registry,
      receipts,
      commit,
      configHash,
    });
    await writeFile(
      `${directory}/requirements-assessment.json`,
      JSON.stringify({ commit, configHash, ...assessment }, null, 2),
    );
    for (const requirement of assessment.results)
      add(requirement.id, requirement.status, {
        reason: requirement.reason,
        runId: requirement.runId,
      });
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
if (profile === "report") {
  const lines = [
    `# ShopFast acceptance — ${result.status}`,
    "",
    `Commit: ${commit}`,
    `Executed: ${result.executedAt}`,
    "",
    "| Profile | Result | Reason |",
    "| --- | --- | --- |",
    ...cases.map(
      (c) => `| ${c.id} | ${c.status} | ${c.reason ?? c.source ?? ""} |`,
    ),
  ];
  await writeFile(`${directory}/summary.md`, lines.join("\n") + "\n");
  const escape = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
        })[c],
    );
  await writeFile(
    `${directory}/junit.xml`,
    `<testsuite name="ShopFast acceptance" tests="${cases.length}" failures="${cases.filter((c) => c.status !== "PASS").length}">${cases.map((c) => `<testcase name="${escape(c.id)}">${c.status === "PASS" ? "" : `<failure type="${escape(c.status)}">${escape(c.reason ?? c.source ?? c.status)}</failure>`}</testcase>`).join("")}</testsuite>\n`,
  );
}
console.log(
  `${profile}: ${result.status}; ${cases.length} cases; report ${directory}/${result.runId}.json`,
);
if (result.status !== "PASS") process.exitCode = 1;
