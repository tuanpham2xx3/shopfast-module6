import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assessRequirements,
  digest,
  verifyArtifact,
} from "../core/evidence.mjs";
test("acceptance detects omitted requirements, stale receipts and forged/missing artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "shopfast-evidence-"));
  try {
    await writeFile(join(root, "source.txt"), "original SRS");
    await writeFile(join(root, "run.log"), "actual test output");
    const registry = {
      source: { path: "source.txt", sha256: digest("original SRS") },
      requirements: [{ id: "F01-01" }, { id: "SEC-01" }],
      cases: [],
    };
    const receipt = {
      caseId: "F01-01",
      commit: "candidate",
      configHash: "config",
      dirty: false,
      status: "PASS",
      exitCode: 0,
      command: ["node", "test"],
      executedAt: new Date().toISOString(),
      assertions: [
        { name: "specific assertion", expected: 1, actual: 1, passed: true },
      ],
      artifacts: [
        { path: "run.log", bytes: 18, sha256: digest("actual test output") },
      ],
    };
    const assess = (receipts) =>
      assessRequirements({
        registry,
        receipts,
        commit: "candidate",
        configHash: "config",
        root,
      });
    let result = await assess([receipt]);
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.results[0].status, "PASS");
    assert.equal(result.results[1].status, "NOT_RUN");
    assert.equal(
      (await assess([{ ...receipt, commit: "old" }])).results[0].status,
      "NOT_RUN",
    );
    assert.equal(
      (await assess([{ ...receipt, dirty: true }])).results[0].status,
      "FAIL",
    );
    assert.equal(
      (await assess([{ ...receipt, assertions: [] }])).results[0].status,
      "FAIL",
    );
    await writeFile(join(root, "run.log"), "tampered");
    assert.equal((await assess([receipt])).results[0].status, "FAIL");
    assert.equal(
      await verifyArtifact(
        {
          path: "missing.log",
          bytes: 18,
          sha256: digest("actual test output"),
        },
        root,
      ),
      false,
    );
    await writeFile(join(root, "source.txt"), "changed SRS");
    await assert.rejects(assess([]), /SRS changed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("PASS requires every requirement and acceptance case; latest failure wins", async () => {
  const root = await mkdtemp(join(tmpdir(), "shopfast-evidence-"));
  try {
    await writeFile(join(root, "srs"), "source");
    await writeFile(join(root, "log"), "evidence");
    const registry = {
      source: { path: "srs", sha256: digest("source") },
      requirements: [{ id: "REQ" }],
      cases: [{ id: "CASE" }],
    };
    const template = {
      commit: "sha",
      configHash: "cfg",
      dirty: false,
      status: "PASS",
      exitCode: 0,
      command: ["test"],
      executedAt: "2026-01-01T00:00:00Z",
      assertions: [
        { name: "assert", expected: true, actual: true, passed: true },
      ],
      artifacts: [{ path: "log", bytes: 8, sha256: digest("evidence") }],
    };
    const receipts = ["REQ", "CASE"].map((caseId) => ({ ...template, caseId }));
    const assess = (receipts) =>
      assessRequirements({
        registry,
        receipts,
        commit: "sha",
        configHash: "cfg",
        root,
      });
    assert.equal((await assess(receipts)).status, "PASS");
    assert.equal(
      (
        await assess([
          ...receipts,
          {
            ...template,
            caseId: "CASE",
            status: "FAIL",
            executedAt: "2026-01-02T00:00:00Z",
          },
        ])
      ).status,
      "FAIL",
    );
    assert.equal(
      await verifyArtifact(
        { path: "../outside", bytes: 1, sha256: digest("x") },
        root,
      ),
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
import { readFile } from "node:fs/promises";
test("real SRS registry includes every source bullet and all acceptance cases", async () => {
  const registry = JSON.parse(
    await readFile("harness/registries/requirements.json", "utf8"),
  );
  const result = await assessRequirements({
    registry,
    receipts: [],
    commit: "test",
    configHash: "test",
  });
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.results.length, 111);
  const missing = structuredClone(registry);
  missing.requirements.splice(0, 1);
  await assert.rejects(
    assessRequirements({
      registry: missing,
      receipts: [],
      commit: "test",
      configHash: "test",
    }),
    /omitted/,
  );
  const missingCase = structuredClone(registry);
  missingCase.cases.splice(0, 1);
  await assert.rejects(
    assessRequirements({
      registry: missingCase,
      receipts: [],
      commit: "test",
      configHash: "test",
    }),
    /omitted/,
  );
});
