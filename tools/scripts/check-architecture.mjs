import { readFile, readdir } from "node:fs/promises";
import { resolve, relative, dirname, sep } from "node:path";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
const require = createRequire(import.meta.url);
const ts = require("../../node_modules/typescript");
const root = resolve(import.meta.dirname, "../..");
const violations = [];
let count = 0;
const graph = new Map();
const portable = (value) => value.split(sep).join("/");
async function inspect(folder) {
  for (const entry of await readdir(resolve(root, folder), {
    withFileTypes: true,
  })) {
    const file = `${folder}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!["node_modules", "dist", "coverage"].includes(entry.name))
        await inspect(file);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(file)) continue;
    count++;
    graph.set(file, new Set());
    const source = ts.createSourceFile(
      file,
      await readFile(resolve(root, file), "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    function visit(node) {
      if (
        file.includes("/application/") &&
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ["query", "createQueryBuilder"].includes(node.expression.name.text)
      )
        violations.push(`${file}: application must use persistence adapters`);
      if (
        file.includes("/http/") &&
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ["query", "transaction", "createQueryBuilder"].includes(
          node.expression.name.text,
        )
      )
        violations.push(`${file}: HTTP adapters cannot query databases`);
      let specifier;
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
        specifier = node.moduleSpecifier;
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          node.expression.getText(source) === "require")
      )
        specifier = node.arguments[0];
      if (specifier && ts.isStringLiteral(specifier)) {
        const spec = specifier.text;
        if (file.includes("/http/") && spec === "typeorm")
          violations.push(`${file}: HTTP adapters cannot import TypeORM`);
        const target = spec.startsWith(".")
          ? portable(relative(root, resolve(root, dirname(file), spec)))
          : spec;
        if (spec.startsWith(".")) {
          const resolved = [
            target + ".ts",
            target + ".tsx",
            target + "/index.ts",
          ].find((candidate) => existsSync(resolve(root, candidate)));
          if (resolved && !node.importClause?.isTypeOnly)
            graph.get(file).add(resolved);
        }
        if (
          file.includes("/application/") &&
          /\/(http|composition)\//.test(target)
        )
          violations.push(
            `${file}: application cannot depend on HTTP or composition`,
          );
        if (
          file.includes("/application/") &&
          ts.isImportDeclaration(node) &&
          node.importClause?.namedBindings &&
          ts.isNamedImports(node.importClause.namedBindings) &&
          node.importClause.namedBindings.elements.some(
            (element) =>
              (element.propertyName?.text ?? element.name.text) ===
              "GoogleGeminiProvider",
          )
        )
          violations.push(`${file}: configure Google provider in composition`);
        const inBackend = /^(libs|apps\/(api|worker))\//.test(file);
        const message =
          file.includes("/persistence/") &&
          /\/(application|http|composition)\//.test(target)
            ? "persistence cannot depend on application, HTTP or composition"
            : file.startsWith("libs/") &&
                /^(apps|tests|scripts|harness|tools)\//.test(target)
              ? "libraries cannot depend on application composition, tests or tooling"
              : file.startsWith("libs/platform/") &&
                  (target.startsWith("libs/modules/") ||
                    spec.startsWith("@shopfast/modules"))
                ? "platform cannot depend on business modules"
                : file.startsWith("apps/web/") &&
                    /^(libs|apps\/(api|worker)|database)\//.test(target)
                  ? "browser cannot import backend implementation"
                  : inBackend && target.startsWith("apps/web/")
                    ? "backend cannot import browser implementation"
                    : null;
        if (message) violations.push(`${file}: ${spec}: ${message}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}
await inspect("apps");
await inspect("libs");
const visiting = new Set(),
  visited = new Set();
function visitDependencies(file, chain = []) {
  if (visiting.has(file)) {
    violations.push(
      `dependency cycle: ${[...chain.slice(chain.indexOf(file)), file].join(" -> ")}`,
    );
    return;
  }
  if (visited.has(file) || !graph.has(file)) return;
  visiting.add(file);
  for (const dependency of graph.get(file))
    visitDependencies(dependency, [...chain, file]);
  visiting.delete(file);
  visited.add(file);
}
for (const file of graph.keys()) visitDependencies(file);
for (const feature of await readdir(resolve(root, "libs/modules"), {
  withFileTypes: true,
})) {
  if (!feature.isDirectory()) continue;
  for (const item of await readdir(
    resolve(root, "libs/modules", feature.name),
  )) {
    if (item.endsWith(".ts"))
      violations.push(
        `libs/modules/${feature.name}/${item}: source belongs in src/`,
      );
  }
}
if (violations.length) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Architecture boundaries: ${count} TypeScript files checked; zero violations`,
  );
