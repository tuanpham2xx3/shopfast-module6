import { readFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const refs = JSON.parse(
  await readFile(path.join(root, "references.json"), "utf8"),
);
await mkdir(path.join(root, "references"), { recursive: true });
function git(args) {
  const result = spawnSync("git", args, { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Git failed: ${args[0]}`);
}
for (const ref of refs) {
  if (
    !/^[a-z0-9-]+$/.test(ref.name) ||
    !/^https:\/\/github\.com\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+\.git$/.test(
      ref.url,
    )
  )
    throw new Error("Invalid reference manifest");
  const target = path.join(root, "references", ref.name);
  let exists = false;
  try {
    await readFile(path.join(target, ".git", "HEAD"));
    exists = true;
  } catch {}
  if (exists) {
    console.log(`Preserved existing checkout: ${ref.name}`);
    continue;
  }
  git(["-c", "core.longpaths=true", "clone", "--depth", "1", ref.url, target]);
  if (ref.commit) {
    git(["-C", target, "fetch", "--depth", "1", "origin", ref.commit]);
    git([
      "-C",
      target,
      "-c",
      "core.longpaths=true",
      "checkout",
      "--detach",
      ref.commit,
    ]);
  }
}
