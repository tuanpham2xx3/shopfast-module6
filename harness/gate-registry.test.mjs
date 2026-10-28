import test from "node:test";
import assert from "node:assert/strict";
import { assertRegisteredGates } from "./gate-registry.mjs";
test("quality receipts use the actual SRS registry gate labels", async () => {
  await assert.doesNotReject(() =>
    assertRegisteredGates([
      "coverage",
      "ci-fail-block",
      "production-scheduler",
    ]),
  );
});
test("previously unbound receipt labels fail before publication", async () => {
  for (const label of ["business-coverage-report", "ci-failure-blocks-merge"])
    await assert.rejects(
      () => assertRegisteredGates([label]),
      /Unregistered evidence gate/,
    );
});
