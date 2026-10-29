import { HttpEmailAdapter } from "../../libs/modules/jobs/src/adapters/email.adapters";
import { renderInvoice } from "../../libs/modules/jobs/src/adapters/invoice.renderer";
import {
  businessDate,
  retryDelay,
} from "../../libs/modules/jobs/src/application/jobs.service";
describe("jobs contracts", () => {
  it("uses Bangkok business dates across UTC midnight", () => {
    expect(businessDate(new Date("2026-10-17T18:00:00Z"))).toBe("2026-10-18");
  });
  it("caps retry delay", () => expect(retryDelay(20, () => 1)).toBe(60000));
  it("creates an actual PDF", async () => {
    const pdf = await renderInvoice(
      { code: "SF-1", total: "1200", discount: "0" },
      [],
    );
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(500);
  });
  it("sends the same email idempotency key through the production HTTP adapter", async () => {
    const transport = jest.fn().mockResolvedValue({ ok: true });
    const email = new HttpEmailAdapter(
      "https://email.example.test/send",
      "backend-token",
      transport as typeof fetch,
    );
    await email.send("verify:123", { template: "verify-email" });
    await email.send("verify:123", { template: "verify-email" });
    expect(transport.mock.calls[0][1].headers["Idempotency-Key"]).toBe(
      "verify:123",
    );
    expect(transport.mock.calls[1][1].headers["Idempotency-Key"]).toBe(
      "verify:123",
    );
    transport.mockResolvedValue({ ok: false });
    await expect(email.send("verify:123", {})).rejects.toThrow(
      "EMAIL_PROVIDER_UNAVAILABLE",
    );
  });
});
