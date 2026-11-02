import { DataSource } from "typeorm";
import { EmailAdapter } from "../jobs.contracts";
export class HttpEmailAdapter implements EmailAdapter {
  readonly mode = "http-idempotent";
  constructor(
    private url: string,
    private token: string,
    private transport: typeof fetch = fetch,
  ) {
    if (!url.startsWith("https://"))
      throw new Error("Email endpoint requires HTTPS");
  }
  async send(key: string, payload: Record<string, unknown>) {
    const response = await this.transport(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
        "Idempotency-Key": key,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("EMAIL_PROVIDER_UNAVAILABLE");
  }
}
export class DevelopmentEmailAdapter implements EmailAdapter {
  readonly mode = "development-fake";
  constructor(
    private source: DataSource,
    private schema = "public",
  ) {
    if (process.env.NODE_ENV === "production")
      throw new Error("Fake email disabled in production");
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema))
      throw new Error("Invalid schema");
  }
  async send(key: string, _payload: Record<string, unknown>) {
    await this.source.query(
      `INSERT INTO "${this.schema}".fake_deliveries(business_key,channel) VALUES($1,'email') ON CONFLICT DO NOTHING`,
      [key],
    );
  }
}
