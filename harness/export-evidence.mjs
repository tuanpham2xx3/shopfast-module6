import "dotenv/config";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import { verifyArtifact } from "./core/evidence.mjs";
import { format } from "prettier";
const source = process.argv[2];
if (!source)
  throw Error("Usage: node harness/export-evidence.mjs path-to-receipt.json");
const root = process.cwd(),
  sourceRelative = relative(root, resolve(source));
if (sourceRelative.startsWith("..") || isAbsolute(sourceRelative))
  throw Error("Receipt outside workspace");
const data = JSON.parse(await readFile(source, "utf8")),
  receipts = Array.isArray(data) ? data : [data];
const artifacts = [
  ...new Map(
    receipts.flatMap((r) => r.artifacts ?? []).map((a) => [a.path, a]),
  ).values(),
];
if (!artifacts.length) throw Error("No artifacts to export");
const allowed = /\.(log|json|png|md|ts|mjs|cjs)$/;
const secrets = Object.entries(process.env)
  .filter(
    ([k, v]) =>
      /KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL|REDIS_URL/.test(k) &&
      v &&
      v.length >= 8,
  )
  .map(([, v]) => v);
const content = [];
for (const artifact of artifacts) {
  if (
    !allowed.test(artifact.path) ||
    /\.secrets|trace|\.zip|\.env/.test(artifact.path)
  )
    throw Error("Artifact requires manual security review: " + artifact.path);
  if (!(await verifyArtifact(artifact)))
    throw Error("Artifact integrity failed: " + artifact.path);
  const bytes = await readFile(artifact.path);
  if (!artifact.path.endsWith(".png")) {
    const text = bytes.toString();
    if (
      secrets.some((s) => text.includes(s)) ||
      /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----|\bAIza[\w-]{20,}|\bgh[pousr]_[\w]{20,}|postgres(?:ql)?:\/\/[^\s"']+:[^\s"']+@/.test(
        text,
      )
    )
      throw Error("Sensitive artifact refused: " + artifact.path);
  }
  content.push({ artifact, bytes });
}
const id = createHash("sha256")
    .update(JSON.stringify(receipts))
    .digest("hex")
    .slice(0, 16),
  target = `docs/evidence/runs/${id}`;
await mkdir(target, { recursive: true });
const manifest = [];
for (const { artifact, bytes } of content) {
  const name =
    artifact.sha256 + (artifact.path.endsWith(".png") ? ".png" : ".txt");
  await writeFile(target + "/" + name, bytes);
  manifest.push({ ...artifact, exportedPath: target + "/" + name });
}
await writeFile(
  target + "/manifest.json",
  await format(
    JSON.stringify(
      {
        sourceReceipt: sourceRelative,
        receipts,
        artifacts: manifest,
        note: "PNG reviewed separately before commit/publication; hash integrity does not prove assertion coverage.",
      },
      null,
      2,
    ),
    { parser: "json" },
  ),
);
console.log(
  JSON.stringify({
    status: "EXPORTED_REVIEW_REQUIRED",
    directory: target,
    artifacts: manifest.length,
  }),
);
