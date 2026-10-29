import { renderEmail } from "../../libs/modules/jobs/src/adapters/email-templates";
describe("branded emails", () => {
  it("renders OTP with plain text and no secret in the URL", () => {
    const mail = renderEmail(
      { template: "verify-email", code: "123456" },
      "https://shopfast.tuanpq.com",
    );
    expect(mail.text).toContain("10 phút");
    expect(mail.html).toContain('lang="vi"');
    expect(mail.html).not.toMatch(/href="[^"]*123456/);
  });
  it("escapes untrusted item and order data and formats VND", () => {
    const mail = renderEmail(
      {
        template: "email.order-confirmation",
        orderCode: "<script>",
        total: 12000,
        items: [
          {
            name: "<img src=x onerror=alert(1)>",
            quantity: 1,
            lineTotal: 12000,
          },
        ],
      },
      "https://shopfast.tuanpq.com",
    );
    expect(mail.html).not.toContain("<img");
    expect(mail.html).toContain("&lt;img");
    expect(mail.text).toContain("12.000");
  });
  it("rejects unknown templates, non-HTTPS origin and malformed OTP", () => {
    expect(() =>
      renderEmail({ template: "unknown" }, "https://shopfast.tuanpq.com"),
    ).toThrow();
    expect(() =>
      renderEmail(
        { template: "verify-email", code: "123456" },
        "http://localhost",
      ),
    ).toThrow();
    expect(() =>
      renderEmail(
        { template: "verify-email", code: "<script>" },
        "https://shopfast.tuanpq.com",
      ),
    ).toThrow();
  });
});
