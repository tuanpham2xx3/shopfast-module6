import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregate, assertFixture, runCommand } from "./core.mjs";
test("missing or blocked checks cannot pass acceptance", () => {
  assert.equal(aggregate([]), "BLOCKED");
  assert.equal(aggregate([{ status: "BLOCKED" }]), "BLOCKED");
  assert.equal(aggregate([{ status: "FAIL" }]), "FAIL");
  assert.equal(aggregate([{ status: "PASS" }]), "PASS");
});
test("destructive fixture names exclude real databases", () => {
  assert.throws(() => assertFixture("shopfast"));
  assert.throws(() => assertFixture("public"));
  assert.equal(assertFixture("harness_fixture123"), "harness_fixture123");
});
test("runner reports actual exit codes and timeout", async () => {
  assert.equal(
    (await runCommand(process.execPath, ["-e", "process.exit(3)"])).status,
    "FAIL",
  );
  assert.equal(
    (
      await runCommand(process.execPath, ["-e", "setTimeout(()=>{},10000)"], {
        timeoutMs: 100,
      })
    ).timedOut,
    true,
  );
  assert.equal(
    (await runCommand(process.execPath, ["-e", "process.exit(0)"])).status,
    "PASS",
  );
});
test("runner redacts configured secrets and database URLs before writing evidence", async () => {
  const result = await runCommand(
    process.execPath,
    [
      "-e",
      "console.error(process.env.TEST_SECRET);console.error('postgresql://user:synthetic@host/database')",
    ],
    { env: { ...process.env, TEST_SECRET: "synthetic-value-must-not-leak" } },
  );
  assert.equal(result.status, "PASS");
  assert(!result.output.includes("synthetic-value-must-not-leak"));
  assert(!result.output.includes("user:synthetic"));
  assert(result.output.includes("[REDACTED]"));
});

test("full output is retained with a verifiable hash while the console excerpt stays bounded", async () => {
  const { readFile } = await import("node:fs/promises");
  const { createHash } = await import("node:crypto");
  const result = await runCommand(process.execPath, [
    "-e",
    "console.log('START-'+ 'x'.repeat(14000)+'-END')",
  ]);
  assert.equal(result.status, "PASS");
  const bytes = await readFile(result.artifact.path);
  assert(bytes.toString().startsWith("START-"));
  assert(bytes.toString().trimEnd().endsWith("-END"));
  assert.equal(bytes.length, result.artifact.bytes);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    result.artifact.sha256,
  );
  assert(result.output.length <= 4000);
});
