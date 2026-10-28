import { readFile, realpath } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
export const digest = (data) => createHash("sha256").update(data).digest("hex");
export async function verifyArtifact(artifact, root = process.cwd()) {
  if (
    !artifact ||
    typeof artifact.path !== "string" ||
    !/^[a-f0-9]{64}$/.test(artifact.sha256 ?? "")
  )
    return false;
  try {
    const base = await realpath(root),
      path = await realpath(resolve(base, artifact.path));
    const rel = relative(base, path);
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) return false;
    const bytes = await readFile(path);
    return (
      bytes.length > 0 &&
      bytes.length === artifact.bytes &&
      digest(bytes) === artifact.sha256
    );
  } catch {
    return false;
  }
}
export async function assessRequirements({
  registry,
  receipts,
  commit,
  configHash,
  root = process.cwd(),
}) {
  const ids = [...registry.requirements, ...registry.cases];
  if (new Set(ids.map((x) => x.id)).size !== ids.length)
    throw Error("Duplicate registry IDs");
  const source = await readFile(resolve(root, registry.source.path));
  if (
    digest(source.toString("utf8").replace(/\r\n/g, "\n")) !==
    registry.source.sha256
  )
    throw Error("SRS changed: regenerate and review registry");
  const bullets = source
    .toString("utf8")
    .split(/\r?\n/)
    .filter((line) => line.startsWith("* "))
    .map((line) => line.slice(2));
  for (const bullet of bullets) {
    if (
      registry.requirements.filter((req) => req.source === bullet).length !== 1
    )
      throw Error("Registry omitted or duplicated an SRS bullet");
  }
  if (source.toString().includes("(Performance)")) {
    for (const metric of [
      "cached-read-p95",
      "checkout-p95",
      "realtime",
      "cache-hit",
      "deploy",
    ])
      if (!registry.requirements.some((req) => req.id === `REQ-PERF-${metric}`))
        throw Error("Registry omitted performance requirement");
    if (
      !registry.requirements.some((req) => req.id === "REQ-DEFENSE-explanation")
    )
      throw Error("Registry omitted human defense requirement");
    if (!registry.acceptanceSource)
      throw Error("Acceptance source manifest required");
  }
  if (registry.acceptanceSource) {
    const acceptance = await readFile(
      resolve(root, registry.acceptanceSource.path),
    );
    if (
      digest(acceptance.toString("utf8").replace(/\r\n/g, "\n")) !==
      registry.acceptanceSource.sha256
    )
      throw Error("Acceptance checklist changed");
    const expectedIds = [
      ...acceptance
        .toString("utf8")
        .matchAll(
          /^\|\s*((?:AUTH|CAT|CART|ORD|RT|RATE|CACHE|JOB|TKT|AI|OPS|UI)-[0-9A-Z]+)\s*\|/gm,
        ),
    ].map((m) => m[1]);
    if (
      JSON.stringify(expectedIds.sort()) !==
      JSON.stringify(registry.cases.map((c) => c.id).sort())
    )
      throw Error("Registry omitted acceptance cases");
  }
  const results = [];
  for (const req of ids) {
    const runs = receipts
      .filter(
        (r) =>
          r.caseId === req.id &&
          r.commit === commit &&
          r.configHash === configHash,
      )
      .sort((a, b) => String(b.executedAt).localeCompare(String(a.executedAt)));
    const receipt = runs[0];
    let status = "NOT_RUN",
      reason = "No receipt for this requirement and release/config";
    if (receipt) {
      status = receipt.status;
      if (!["PASS", "FAIL", "BLOCKED", "NOT_RUN"].includes(status)) {
        status = "FAIL";
        reason = "Unknown receipt status";
      } else if (status === "PASS") {
        const valid =
          receipt.dirty === false &&
          Number.isFinite(Date.parse(receipt.executedAt)) &&
          Date.parse(receipt.executedAt) <= Date.now() + 60000 &&
          receipt.exitCode === 0 &&
          Array.isArray(receipt.command) &&
          receipt.command.length > 0 &&
          Array.isArray(receipt.assertions) &&
          receipt.assertions.length > 0 &&
          receipt.assertions.every(
            (a) =>
              a.passed === true &&
              typeof a.name === "string" &&
              Object.hasOwn(a, "expected") &&
              Object.hasOwn(a, "actual"),
          ) &&
          Array.isArray(receipt.artifacts) &&
          receipt.artifacts.length > 0;
        if (!valid) {
          status = "FAIL";
          reason = "Incomplete PASS receipt";
        } else if (
          !(
            await Promise.all(
              receipt.artifacts.map((a) => verifyArtifact(a, root)),
            )
          ).every(Boolean)
        ) {
          status = "FAIL";
          reason =
            "Artifact missing, empty, escaped workspace or hash/size mismatch";
        } else
          reason =
            "Verified receipt and artifact integrity; assertion validity remains reviewable";
      } else reason = receipt.reason ?? "Non-passing execution";
    }
    results.push({
      id: req.id,
      status,
      reason,
      source: req.source ?? req.given,
      runId: receipt?.runId,
    });
  }
  return {
    status: results.every((r) => r.status === "PASS")
      ? "PASS"
      : results.some((r) => r.status === "FAIL")
        ? "FAIL"
        : "BLOCKED",
    results,
  };
}
