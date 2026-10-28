import { randomUUID } from "node:crypto";
import { createDataSource } from "../../libs/platform/src/database/data-source";
import { ResendEmailAdapter } from "../../libs/modules/jobs/resend-email";
describe("Resend durable idempotency", () => {
  const schema = `test_${randomUUID().replace(/-/g, "")}`;
  const source = createDataSource(process.env.TEST_DATABASE_URL!, schema);
  beforeAll(async () => {
    await source.initialize();
    await source.query(`CREATE SCHEMA "${schema}"`);
    await source.runMigrations();
  });
  afterAll(async () => {
    if (source.isInitialized) {
      await source.query(`DROP SCHEMA "${schema}" CASCADE`);
      await source.destroy();
    }
  });
  const payload = {
    template: "verify-email",
    recipient: "synthetic@example.test",
    code: "123456",
  };
  it("replays the same request after ambiguous timeout, persists provider ID and skips duplicate", async () => {
    const send = jest
      .fn()
      .mockRejectedValueOnce(new Error("timeout after provider accepted"))
      .mockResolvedValue({
        ok: true,
        json: async () => ({ id: "provider-fixture" }),
      });
    const email = new ResendEmailAdapter(
      source,
      schema,
      "synthetic-key",
      "ShopFast <no-reply@example.test>",
      "https://shopfast.tuanpq.com",
      send as typeof fetch,
    );
    await expect(email.send("crash", payload)).rejects.toThrow("timeout");
    await email.send("crash", { ...payload, code: "999999" });
    expect(send.mock.calls[0][1].body).toBe(send.mock.calls[1][1].body);
    expect(send.mock.calls[0][1].headers["Idempotency-Key"]).toBe(
      send.mock.calls[1][1].headers["Idempotency-Key"],
    );
    await email.send("crash", payload);
    expect(send).toHaveBeenCalledTimes(2);
    const [record] = await source.query(
      `SELECT body,provider_id FROM "${schema}".email_deliveries WHERE business_key='crash'`,
    );
    expect(record).toEqual({ body: {}, provider_id: "provider-fixture" });
  });
  it("refuses late retry outside the safe window even for a manually requeued job", async () => {
    await source.query(
      `INSERT INTO "${schema}".email_deliveries(business_key,body,first_attempt_at) VALUES('old','{}',now()-interval '24 hours')`,
    );
    const send = jest.fn();
    const email = new ResendEmailAdapter(
      source,
      schema,
      "synthetic-key",
      "no-reply@example.test",
      "https://shopfast.tuanpq.com",
      send as typeof fetch,
    );
    await expect(email.send("old", payload)).rejects.toThrow(
      "MANUAL_RECONCILIATION",
    );
    expect(send).not.toHaveBeenCalled();
  });
});
