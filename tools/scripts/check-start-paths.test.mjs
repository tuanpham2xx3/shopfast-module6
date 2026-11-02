import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve, dirname, relative, normalize } from "node:path";

const require = createRequire(import.meta.url);
const fs = require("node:fs"),
  childProcess = require("node:child_process");
const { StartAction } = require("@nestjs/cli/actions/start.action");
const root =
  process.env.SHOPFAST_LAYOUT_TEST_ROOT ??
  resolve(import.meta.dirname, "../..");
const nest = JSON.parse(readFileSync(resolve(root, "nest-cli.json"), "utf8"));
for (const name of ["api", "worker"]) {
  test(`Nest dev:${name} starts the TypeScript-emitted entrypoint`, () => {
    const project = nest.projects[name];
    const configFile = resolve(root, project.compilerOptions.tsConfigPath);
    const config = JSON.parse(readFileSync(configFile, "utf8"));
    const sourceRoot = resolve(root, project.sourceRoot);
    const compilerRoot = resolve(
      dirname(configFile),
      config.compilerOptions.rootDir,
    );
    const outDir = resolve(dirname(configFile), config.compilerOptions.outDir);
    const emitted =
      resolve(
        outDir,
        relative(compilerRoot, resolve(sourceRoot, project.entryFile)),
      ) + ".js";
    const exists = fs.existsSync,
      spawn = childProcess.spawn;
    let launched;
    try {
      // Model a clean successful compile, not an old dist directory masking a bad path.
      fs.existsSync = (file) => normalize(String(file)) === normalize(emitted);
      childProcess.spawn = (_binary, args) => {
        launched = args[1];
        return {};
      };
      new StartAction().spawnChildProcess(
        project.entryFile,
        project.sourceRoot,
        false,
        outDir,
        "node",
      );
    } finally {
      fs.existsSync = exists;
      childProcess.spawn = spawn;
    }
    assert.equal(normalize(launched + ".js"), normalize(emitted));
  });
}
