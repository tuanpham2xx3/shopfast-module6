import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
export async function recordCommandGates({ id, result, command, context }) {
  const gates =
    {
      "AI-01": [
        "live-ai-tools",
        "live-human-confirmation",
        "live-refusal",
        "live-classification",
      ],
      "JOB-EMAIL-CRASH": ["resend-crash-window"],
      "STAGING-FULL": ["live-worker-email"],
    }[id] ?? [];
  if (!gates.length) return;
  // Exact command exit + its complete output artifact. This records the command's
  // asserted scope, never promotes a generic profile to unrelated SRS gates.
  const expected = {
    "AI-01": "Gemini agent smoke: 6/6 checks passed;",
    "STAGING-FULL": "Staging: 10 end-to-end checks passed",
    "JOB-EMAIL-CRASH":
      "Real Resend accepted-send/process-crash/replay4checks PASS",
  }[id];
  const passed =
    result.status === "PASS" &&
    !!result.artifact &&
    (!expected || result.output.includes(expected));
  const runId = randomUUID(),
    executedAt = new Date().toISOString();
  const receipts = gates.map((gate) => ({
    runId,
    caseId: "GATE-" + gate,
    ...context,
    executedAt,
    status: passed ? "PASS" : "FAIL",
    exitCode: result.exitCode,
    command,
    assertions: [
      {
        name: id + " exact command assertions",
        expected: expected || "successful crash-window assertions",
        actual: { status: result.status, output: result.output },
        passed,
      },
    ],
    artifacts: result.artifact ? [result.artifact] : [],
  }));
  await mkdir("harness/reports/receipts", { recursive: true });
  await writeFile(
    `harness/reports/receipts/${runId}-gates.json`,
    JSON.stringify(receipts, null, 2),
  );
}
