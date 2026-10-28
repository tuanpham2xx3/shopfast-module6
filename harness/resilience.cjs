const { randomUUID } = require("crypto");
const { spawn } = require("child_process");
const fs = require("fs");
const {
  createDataSource,
} = require("/app/dist-tools/libs/platform/src/database/data-source.js");
const {
  JobsService,
  DevelopmentEmailAdapter,
} = require("/app/dist-tools/libs/modules/jobs/src/jobs.service.js");
const schema = process.env.DATABASE_SCHEMA;
if (!/^harness_recovery_[0-9]+$/.test(schema || ""))
  throw new Error("Isolated recovery schema required");
const source = createDataSource(
  `postgresql://shopfast:${process.env.POSTGRES_PASSWORD}@postgres:5432/shopfast`,
  schema,
);
async function main() {
  await source.initialize();
  const service = new JobsService(
    source,
    new DevelopmentEmailAdapter(source, schema),
    "harness-only-secret-at-least-32-characters",
    schema,
  );
  if (process.argv[2] === "worker") {
    const send = service.email.send.bind(service.email);
    service.email.send = async (key, p) => {
      await send(key, p);
      if (process.env.INJECT_CRASH === "true") {
        fs.writeFileSync("/reports/accepted-marker", "accepted");
        await new Promise(() => {});
      }
    };
    await service.drain(1);
    return;
  }
  await source.query(`CREATE SCHEMA "${schema}"`);
  await source.runMigrations();
  try {
    await service.enqueue("fixture-email", "email.verification", {
      template: "verify-email",
      recipient: "synthetic@example.test",
      code: "123456",
    });
    try {
      fs.unlinkSync("/reports/accepted-marker");
    } catch {}
    const child = spawn(process.execPath, [__filename, "worker"], {
      env: { ...process.env, INJECT_CRASH: "true" },
      stdio: "ignore",
    });
    const until = Date.now() + 20000;
    while (!fs.existsSync("/reports/accepted-marker") && Date.now() < until)
      await new Promise((r) => setTimeout(r, 50));
    if (!fs.existsSync("/reports/accepted-marker")) {
      child.kill("SIGKILL");
      throw new Error("Worker never reached crash marker");
    }
    const stopped = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGKILL");
    await stopped;
    // Inject lease expiry in fixture rather than waiting60seconds. This does not alter deployed timing.
    await source.query(
      `UPDATE "${schema}".job_executions SET lease_until=now()-interval '1 second' WHERE business_key='fixture-email'`,
    );
    await new Promise((resolve, reject) => {
      const retry = spawn(process.execPath, [__filename, "worker"], {
        env: { ...process.env, INJECT_CRASH: "false" },
        stdio: "ignore",
      });
      retry.on("exit", (code) =>
        code === 0 ? resolve() : reject(new Error("Recovery worker failed")),
      );
    });
    const [{ count }] = await source.query(
      `SELECT count(*)::int count FROM "${schema}".fake_deliveries WHERE business_key='fixture-email'`,
    );
    const [job] = await source.query(
      `SELECT status,attempts FROM "${schema}".job_executions WHERE business_key='fixture-email'`,
    );
    if (count !== 1 || job.status !== "SUCCEEDED" || job.attempts !== 2)
      throw new Error("Recovery invariant failed");
    fs.writeFileSync(
      "/reports/resilience.json",
      JSON.stringify(
        {
          status: "PASS",
          executedAt: new Date().toISOString(),
          checks: [
            "real worker process SIGKILL after accepted side effect",
            "expired lease reclaimed by restarted process",
            "one delivery despite two attempts",
            "durable execution succeeded",
          ],
          provider:
            "deterministic PostgreSQL-backed test sink, not Resend live",
        },
        null,
        2,
      ),
    );
    console.log("Worker crash/restart4checks PASS");
  } finally {
    await source.query(`DROP SCHEMA "${schema}" CASCADE`);
  }
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => source.isInitialized && source.destroy());
