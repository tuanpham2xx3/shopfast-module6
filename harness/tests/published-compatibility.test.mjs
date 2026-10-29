import test from "node:test";
import assert from "node:assert/strict";
import { compareSourceTrees } from "../core/published-compatibility.mjs";

test("uses historical location without relabeling the execution commit", () => {
  const reads = [];
  const result = compareSourceTrees(
    "old",
    "new",
    [
      {
        path: "harness/core/remote.mjs",
        executionPaths: ["harness/core/remote.mjs", "harness/remote.mjs"],
      },
    ],
    (commit, path) => {
      reads.push([commit, path]);
      return commit === "old" && path.includes("/core/") ? null : "same-blob";
    },
  );
  assert.equal(result[0].executionPath, "harness/remote.mjs");
  assert.equal(result[0].compatible, true);
  assert.deepEqual(reads, [
    ["old", "harness/core/remote.mjs"],
    ["old", "harness/remote.mjs"],
    ["new", "harness/core/remote.mjs"],
  ]);
});
test("changed backend remains incompatible despite a path alias", () => {
  const result = compareSourceTrees("old", "new", ["apps"], (commit) =>
    commit === "old" ? "old-tree" : "new-tree",
  );
  assert.equal(result[0].compatible, false);
});
test("missing historical or current paths are incompatible, never equal nulls", () => {
  const result = compareSourceTrees("old", "new", ["missing"], () => null);
  assert.equal(result[0].compatible, false);
  assert.equal(result[0].executionTree, null);
  assert.equal(result[0].currentTree, null);
});
