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
