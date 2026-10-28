import { parseEnvironment } from "../../libs/platform/src/config/environment";

describe("parseEnvironment", () => {
  const production = {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1/fixture",
    REDIS_URL: "redis://127.0.0.1:6379",
    ACCESS_TOKEN_SECRET: "x".repeat(32),
    INVOICE_SIGNING_SECRET: "y".repeat(32),
    GEMINI_API_KEY: "synthetic-key",
    GEMINI_MODEL: "synthetic-model",
    WEB_ORIGIN: "https://shopfast.example.test",
    EMAIL_PROVIDER: "resend",
    RESEND_API_KEY: "synthetic-provider-key",
    EMAIL_FROM: "ShopFast <no-reply@example.test>",
  };
  it("accepts complete production settings and rejects plaintext origin or missing email provider", () => {
    expect(parseEnvironment(production).NODE_ENV).toBe("production");
    expect(() =>
      parseEnvironment({ ...production, WEB_ORIGIN: "http://example.test" }),
    ).toThrow("HTTPS");
    expect(() =>
      parseEnvironment({ ...production, RESEND_API_KEY: "" }),
    ).toThrow("Resend");
    expect(() =>
      parseEnvironment({ ...production, EMAIL_PROVIDER: "" }),
    ).toThrow("email provider");
    expect(() =>
      parseEnvironment({ ...production, INVOICE_SIGNING_SECRET: "short" }),
    ).toThrow("too short");
  });
  it("fails closed for incomplete production credentials without exposing values", () => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: "production",
        ACCESS_TOKEN_SECRET: "synthetic-secret-that-must-not-leak",
      }),
    ).toThrow(/DATABASE_URL/);
    try {
      parseEnvironment({
        NODE_ENV: "production",
        ACCESS_TOKEN_SECRET: "synthetic-secret-that-must-not-leak",
      });
    } catch (e) {
      expect(String(e)).not.toContain("synthetic-secret-that-must-not-leak");
    }
  });
  it("rejects an invalid HTTP port with an actionable field path", () => {
    expect(() => parseEnvironment({ NODE_ENV: "test", PORT: "70000" })).toThrow(
      /PORT/,
    );
  });

  it("applies safe local defaults outside production", () => {
    expect(parseEnvironment({ NODE_ENV: "test" })).toMatchObject({
      NODE_ENV: "test",
      PORT: 3000,
      API_PREFIX: "api/v1",
    });
  });
});
