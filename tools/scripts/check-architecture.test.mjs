import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, writeFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
function probe(files, expected) {
  const created = [];
  try {
    for (const [relative, source] of Object.entries(files)) {
      const file = resolve(root, relative);
      assert.equal(existsSync(file), false, "never overwrite an existing file");
      writeFileSync(file, source);
      created.push(file);
    }
    const result = spawnSync(
      process.execPath,
      ["tools/scripts/check-architecture.mjs"],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(result.status, expected ? 1 : 0, result.stderr);
    if (expected) assert.match(result.stderr, expected);
  } finally {
    for (const file of created) unlinkSync(file);
  }
}

test("rejects database calls in HTTP", () =>
  probe(
    {
      "libs/modules/catalog/src/http/__architecture_probe__.ts":
        "export const run = (db: {query: () => void}) => db.query();",
    },
    /HTTP adapters cannot query databases/,
  ));
test("rejects direct SQL in application", () =>
  probe(
    {
      "libs/modules/catalog/src/application/__architecture_probe__.ts":
        "export const run = (db: {query: () => void}) => db.query();",
    },
    /application must use persistence adapters/,
  ));
test("rejects persistence depending on application", () =>
  probe(
    {
      "libs/modules/catalog/src/persistence/__architecture_probe__.ts":
        'import { CatalogService } from "../application/catalog.service"; export {CatalogService};',
    },
    /persistence cannot depend/,
  ));
test("rejects provider construction dependency in application", () =>
  probe(
    {
      "libs/modules/catalog/src/application/__architecture_probe__.ts":
        'import { GoogleGeminiProvider } from "../../../ai/src/adapters/gemini.provider"; export { GoogleGeminiProvider };',
    },
    /configure Google provider in composition/,
  ));
test("rejects dependency cycles", () =>
  probe(
    {
      "apps/web/src/app/__architecture_probe_a.ts":
        'import "./__architecture_probe_b"; export const a = 1;',
      "apps/web/src/app/__architecture_probe_b.ts":
        'import "./__architecture_probe_a"; export const b = 1;',
    },
    /dependency cycle/,
  ));
test("accepts application depending on its contracts", () =>
  probe({
    "libs/modules/catalog/src/application/__architecture_probe__.ts":
      'import { CatalogError } from "../catalog.contracts"; export {CatalogError};',
  }));
