import { DataSource } from "typeorm";
import { createHash } from "node:crypto";
import { EmailAdapter, PermanentJobError } from "./jobs.service";
import { renderEmail } from "./email-templates";
export class ResendEmailAdapter implements EmailAdapter {
  readonly mode = "resend";
  constructor(
    private source: DataSource,
    private schema: string,
    private key: string,
    private from: string,
    private origin: string,
    private transport: typeof fetch = fetch,
  ) {
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema))
      throw new Error("Invalid schema");
  }
  async send(key: string, payload: Record<string, unknown>) {
    const table = `"${this.schema}".email_deliveries`;
    const [existing] = await this.source.query(
      `SELECT * FROM ${table} WHERE business_key=$1`,
      [key],
    );
    if (existing?.provider_id) return;
    if (!existing) {
      const rendered = renderEmail(payload, this.origin);
      await this.source.query(
        `INSERT INTO ${table}(business_key,body) VALUES($1,$2) ON CONFLICT DO NOTHING`,
        [
          key,
          JSON.stringify({
            from: this.from,
            to: [payload.recipient],
            ...rendered,
          }),
        ],
      );
    }
    const [record] = await this.source.query(
      `SELECT * FROM ${table} WHERE business_key=$1`,
      [key],
    );
    if (record.provider_id) return;
    // Never blindly retry beyond provider's 24h dedup window, including manual job retry.
    if (
      Date.now() - new Date(record.first_attempt_at).getTime() >=
      23 * 3600000
    )
      throw new PermanentJobError("EMAIL_REQUIRES_MANUAL_RECONCILIATION");
    const response = await this.transport("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": createHash("sha256").update(key).digest("hex"),
      },
      body: JSON.stringify(record.body),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      if ([400, 401, 403, 409, 422].includes(response.status))
        throw new PermanentJobError("EMAIL_PROVIDER_REJECTED");
      throw new Error("EMAIL_PROVIDER_UNAVAILABLE");
    }
    const data = (await response.json()) as { id?: string };
    if (!data.id) throw new Error("INVALID_EMAIL_PROVIDER_RESPONSE");
    await this.source.query(
      `UPDATE ${table} SET provider_id=$2,sent_at=now(),body='{}' WHERE business_key=$1`,
      [key, data.id],
    );
  }
}
