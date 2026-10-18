import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
async function walk(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(target)));
    else if (entry.name.endsWith(".md")) result.push(target);
  }
  return result;
}
let errors = 0;
const files = [
  ...(await walk(path.join(root, "docs"))),
  path.join(root, "AGENTS.md"),
];
for (const file of files) {
  const source = await readFile(file, "utf8");
  for (const match of source.matchAll(/\]\(([^)]+)\)/g)) {
    let target = match[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    target = decodeURIComponent(target.replace(/^<|>$/g, "").split("#")[0]);
    try {
      await stat(path.resolve(path.dirname(file), target));
    } catch {
      console.error(`BROKEN ${path.relative(root, file)} -> ${target}`);
      errors++;
    }
  }
}
console.log(
  `Checked ${files.length} documentation files; broken links: ${errors}`,
);
process.exitCode = errors ? 1 : 0;
