import { readFile, readdir } from "node:fs/promises";
import { resolve, relative, dirname, sep } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("../../node_modules/typescript");
const root = resolve(import.meta.dirname, "../..");
const violations = [];
let count = 0;
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
    const source = ts.createSourceFile(
      file,
      await readFile(resolve(root, file), "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    function visit(node) {
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
        const inBackend = /^(libs|apps\/(api|worker))\//.test(file);
        const message =
          file.startsWith("libs/") &&
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
