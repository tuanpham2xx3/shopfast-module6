import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { assessRequirements, digest } from "./evidence.mjs";
import { harnessContext } from "./context.mjs";
export async function deriveRequirements(context = harnessContext()) {
  const registry = JSON.parse(
    await readFile("harness/requirements.json", "utf8"),
  );
  const mapping = JSON.parse(
    await readFile("harness/requirement-map.json", "utf8"),
  );
  if (
    JSON.stringify(mapping.requirements.map((r) => r.id).sort()) !==
    JSON.stringify(registry.requirements.map((r) => r.id).sort())
  )
    throw Error("Requirement map incomplete");
  await mkdir("harness/reports/receipts", { recursive: true });
  const receipts = [];
  for (const file of await readdir("harness/reports/receipts")) {
    if (!file.endsWith(".json") || file.endsWith("-derived.json")) continue;
    const data = JSON.parse(
      await readFile("harness/reports/receipts/" + file, "utf8"),
    );
    receipts.push(...(Array.isArray(data) ? data : [data]));
  }
  const gates = [
    ...new Set(mapping.requirements.flatMap((r) => r.externalGates)),
  ].map((id) => ({
    id: "GATE-" + id,
    source: "Explicit external execution gate: " + id,
    kind: "external-gate",
  }));
  const assessed = await assessRequirements({
    registry: {
      ...registry,
      requirements: [...registry.requirements, ...gates],
    },
    receipts,
    ...context,
  });
  const results = new Map(assessed.results.map((r) => [r.id, r]));
  const runId = randomUUID(),
    executedAt = new Date().toISOString();
  const artifactsPath = `harness/reports/artifacts/${runId}-dependency-assessment.json`,
    body = Buffer.from(
      JSON.stringify(
        { runId, ...context, executedAt, results: assessed.results },
        null,
        2,
      ),
    );
  await mkdir("harness/reports/artifacts", { recursive: true });
  await writeFile(artifactsPath, body);
  const artifact = {
    path: artifactsPath,
    bytes: body.length,
    sha256: digest(body),
  };
  const output = mapping.requirements.map((req) => {
    const dependencies = [
      ...req.dependencies,
      ...req.externalGates.map((g) => "GATE-" + g),
    ];
    const assertions = dependencies.map((id) => ({
      name: id,
      expected: "verified PASS evidence for the same release/config",
      actual: results.get(id)?.status ?? "NOT_RUN",
      passed: results.get(id)?.status === "PASS",
    }));
    const status = assertions.every((a) => a.passed)
      ? "PASS"
      : assertions.some((a) => a.actual === "FAIL")
        ? "FAIL"
        : "BLOCKED";
    // Link underlying artifacts, not only a summary declaring dependencies passed.
    const artifacts = [artifact];
    for (const id of dependencies) {
      const entry = results.get(id);
      const receipt = receipts.find(
        (r) => r.caseId === id && r.runId === entry?.runId,
      );
      for (const a of receipt?.artifacts ?? [])
        if (!artifacts.some((v) => v.path === a.path)) artifacts.push(a);
    }
    return {
      runId,
      caseId: req.id,
      ...context,
      executedAt,
      status,
      reason:
        status === "PASS"
          ? "All explicit dependencies have verified receipts"
          : "Missing or failing dependencies: " +
            assertions
              .filter((a) => !a.passed)
              .map((a) => a.name)
              .join(", "),
      exitCode: status === "PASS" ? 0 : 1,
      command: ["node", "harness/derive.mjs"],
      assertions,
      artifacts,
    };
  });
  await writeFile(
    `harness/reports/receipts/${runId}-derived.json`,
    JSON.stringify(output, null, 2),
  );
  return {
    status: output.every((r) => r.status === "PASS") ? "PASS" : "BLOCKED",
    requirements: output.length,
    passed: output.filter((r) => r.status === "PASS").length,
    blocked: output
      .filter((r) => r.status !== "PASS")
      .map((r) => ({ id: r.caseId, reason: r.reason })),
  };
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/derive.mjs")) {
  const result = await deriveRequirements();
  console.log(JSON.stringify(result));
  if (result.status !== "PASS") process.exitCode = 1;
}
