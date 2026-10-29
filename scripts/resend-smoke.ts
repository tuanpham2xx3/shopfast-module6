import "dotenv/config";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { renderEmail } from "../libs/modules/jobs/src/adapters/email-templates";
async function main() {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_TEST_TO)
    throw new Error("Missing backend email configuration");
  const template = renderEmail(
    {
      template: "email.order-confirmation",
      orderCode: "DEMO-EMAIL",
      total: 1280000,
      discount: 0,
      items: [
        { name: "Tai nghe Studio", quantity: 1, lineTotal: 490000 },
        { name: "Loa Mini", quantity: 1, lineTotal: 790000 },
      ],
    },
    "https://shopfast.tuanpq.com",
  );
  const body = JSON.stringify({
    from: "ShopFast <no-reply@mail.shopfast.tuanpq.com>",
    to: [process.env.EMAIL_TEST_TO],
    ...template,
    subject: "[DEMO] " + template.subject,
  });
  const key = "shopfast-template-" + randomUUID();
  async function send() {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body,
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Provider rejected test email");
    return (await response.json()) as { id: string };
  }
  const first = await send(),
    replay = await send();
  if (first.id !== replay.id) throw new Error("Provider idempotency failed");
  await writeFile(
    process.env.RESEND_SMOKE_REPORT_PATH ??
      "docs/evidence/resend-template-live.json",
    JSON.stringify(
      {
        executedAt: new Date().toISOString(),
        emailId: first.id,
        accepted: true,
        replaySameId: true,
        delivery: "not_checked",
        template: "branded order confirmation synthetic DEMO",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Branded email accepted; idempotency replay matched. Delivery/inbox appearance not yet verified.",
  );
}
void main().catch(() => {
  console.error("Resend smoke failed; no credentials logged");
  process.exitCode = 1;
});
