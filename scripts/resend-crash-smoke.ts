import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createDataSource } from "../libs/platform/src/database/data-source";
import { ResendEmailAdapter } from "../libs/modules/jobs/src/resend-email";
async function main() {
  if (
    !process.env.TEST_DATABASE_URL ||
    !process.env.RESEND_API_KEY ||
    !process.env.EMAIL_TEST_TO
  )
    throw new Error("Missing test configuration");
  const child = process.argv.includes("--child");
  const schema =
    process.env.RESEND_CRASH_SCHEMA ??
    `harness_email_${randomUUID().replace(/-/g, "")}`;
  if (!/^harness_email_[0-9a-f]{32}$/.test(schema))
    throw new Error("Invalid isolated schema");
  const source = createDataSource(process.env.TEST_DATABASE_URL, schema);
  await source.initialize();
  const marker = `harness/reports/${schema}.json`;
  const key = `crash:${schema}`;
  const payload = {
    template: "email.order-confirmation",
    recipient: process.env.EMAIL_TEST_TO,
    orderCode: "DEMO-CRASH-TEST",
    total: 100000,
    discount: 0,
    items: [
      {
        name: "Sản phẩm giả để kiểm thử gửi email",
        quantity: 1,
        lineTotal: 100000,
      },
    ],
  };
  try {
    await mkdir("harness/reports", { recursive: true });
    if (child) {
      const transport: typeof fetch = async (input, init) => {
        const response = await fetch(input, init);
        if (!response.ok) throw new Error("Provider rejected crash fixture");
        const accepted = (await response.clone().json()) as { id: string };
        await writeFile(marker, JSON.stringify({ id: accepted.id }));
        await new Promise(() => {});
        return response;
      };
      await new ResendEmailAdapter(
        source,
        schema,
        process.env.RESEND_API_KEY,
        "ShopFast <no-reply@mail.shopfast.tuanpq.com>",
        "https://shopfast.tuanpq.com",
        transport,
      ).send(key, payload);
      return;
    }
    await source.query(`CREATE SCHEMA "${schema}"`);
    await source.runMigrations();
    const worker = spawn(
      process.execPath,
      ["-r", require.resolve("ts-node/register"), __filename, "--child"],
      { env: { ...process.env, RESEND_CRASH_SCHEMA: schema }, stdio: "ignore" },
    );
    let accepted: { id: string } | undefined;
    try {
      const until = Date.now() + 30000;
      while (Date.now() < until) {
        try {
          accepted = JSON.parse(await readFile(marker, "utf8"));
          if (accepted?.id) break;
        } catch {
          /* Await the receipt marker. */
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!accepted?.id) throw new Error("No provider acceptance marker");
    } finally {
      const exited = new Promise((resolve) => worker.once("exit", resolve));
      worker.kill("SIGKILL");
      await exited;
    }
    const [before] = await source.query(
      `SELECT provider_id FROM "${schema}".email_deliveries WHERE business_key=$1`,
      [key],
    );
    if (before.provider_id)
      throw new Error("Crash did not precede local receipt commit");
    let replayId: string | undefined;
    const transport: typeof fetch = async (input, init) => {
      const r = await fetch(input, init);
      if (r.ok) replayId = ((await r.clone().json()) as { id: string }).id;
      return r;
    };
    await new ResendEmailAdapter(
      source,
      schema,
      process.env.RESEND_API_KEY,
      "ShopFast <no-reply@mail.shopfast.tuanpq.com>",
      "https://shopfast.tuanpq.com",
      transport,
    ).send(key, payload);
    if (replayId !== accepted.id)
      throw new Error("Provider replay duplicated email");
    const [receipt] = await source.query(
      `SELECT provider_id,body FROM "${schema}".email_deliveries WHERE business_key=$1`,
      [key],
    );
    if (
      receipt.provider_id !== accepted.id ||
      JSON.stringify(receipt.body) !== "{}"
    )
      throw new Error("Recovered local receipt invalid");
    await writeFile(
      "harness/reports/resend-crash.json",
      JSON.stringify(
        {
          executedAt: new Date().toISOString(),
          status: "PASS",
          provider: "Resend live",
          emailId: accepted.id,
          checks: [
            "provider accepted real email",
            "child process killed before local receipt commit",
            "new adapter replay returned same provider ID",
            "receipt committed and private rendered body cleared",
          ],
        },
        null,
        2,
      ) + "\n",
    );
    console.log("Real Resend accepted-send/process-crash/replay4checks PASS");
  } finally {
    if (!child) {
      await source.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await unlink(marker).catch(() => undefined);
    }
    await source.destroy();
  }
}
void main().catch(() => {
  console.error("Resend crash smoke failed; no credentials logged");
  process.exitCode = 1;
});
