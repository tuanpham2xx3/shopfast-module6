import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import { createDataSource } from "../../libs/platform/src/database/data-source";
import {
  AuthError,
  AuthService,
} from "../../libs/modules/auth/src/auth.service";

describe("auth service integration", () => {
  let source: DataSource;
  let service: AuthService;
  const schema = `test_${randomUUID().replace(/-/g, "")}`;
  const secret = "test-access-secret-at-least-32-characters";

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL)
      throw new Error("TEST_DATABASE_URL is required");
    source = await createDataSource(
      process.env.TEST_DATABASE_URL,
      schema,
    ).initialize();
    await source.query(`CREATE SCHEMA "${schema}"`);
    await source.runMigrations();
    service = new AuthService(source, {
      accessTokenSecret: secret,
      schema,
      codeGenerator: () => "123456",
    });
  });
  afterAll(async () => {
    if (source?.isInitialized) {
      await source.query(`DROP SCHEMA "${schema}" CASCADE`);
      await source.destroy();
    }
  });

  it("registers a normalized unverified customer without exposing OTP or hashes", async () => {
    const result = await service.register({
      email: "  Alice@Example.COM ",
      password: "correct horse battery",
      displayName: "Alice",
    });
    expect(result.user).toMatchObject({
      email: "alice@example.com",
      role: "CUSTOMER",
      verified: false,
      displayName: "Alice",
    });
    expect(JSON.stringify(result)).not.toContain("123456");
    expect(JSON.stringify(result)).not.toContain("passwordHash");
    const [user] = await source.query(
      `SELECT email,password_hash FROM "${schema}".users WHERE id=$1`,
      [result.user.id],
    );
    expect(user.email).toBe("alice@example.com");
    expect(user.password_hash).toMatch(/^\$argon2id\$/);
  });

  it("verifies the newest OTP once and then allows login", async () => {
    const registered = await service.register({
      email: "verify@example.com",
      password: "correct horse battery",
      displayName: "Verify",
    });
    const verified = await service.confirmVerification(
      registered.accessToken,
      "123456",
    );
    expect(verified.verified).toBe(true);
    await expect(
      service.confirmVerification(registered.accessToken, "123456"),
    ).rejects.toMatchObject({ code: "INVALID_VERIFICATION_CODE" });
    const login = await service.login(
      "VERIFY@example.com",
      "correct horse battery",
    );
    expect(login.user.verified).toBe(true);
  });

  it("uses the same invalid-credentials error for unknown email and wrong password", async () => {
    const errors: string[] = [];
    for (const [email, password] of [
      ["missing@example.com", "correct horse battery"],
      ["verify@example.com", "wrong password value"],
    ] as const) {
      try {
        await service.login(email, password);
      } catch (error) {
        errors.push((error as AuthError).code);
      }
    }
    expect(errors).toEqual(["INVALID_CREDENTIALS", "INVALID_CREDENTIALS"]);
  });

  it("rotates refresh tokens and revokes the family when an old token is reused", async () => {
    const login = await service.login(
      "verify@example.com",
      "correct horse battery",
    );
    const rotated = await service.refresh(login.refreshToken);
    expect(rotated.refreshToken).not.toBe(login.refreshToken);
    await expect(service.refresh(login.refreshToken)).rejects.toMatchObject({
      code: "REFRESH_TOKEN_REUSED",
    });
    await expect(service.refresh(rotated.refreshToken)).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
    });
  });

  it("keeps verification resend generic, throttled and invalidates the old code", async () => {
    const registered = await service.register({
      email: "resend@example.com",
      password: "correct horse battery",
      displayName: "Resend",
    });
    await expect(
      service.sendVerification("missing@example.com"),
    ).resolves.toBeUndefined();
    await service.sendVerification("resend@example.com");
    const [{ count: throttledCount }] = await source.query(
      `SELECT count(*)::int count FROM "${schema}".verification_codes WHERE user_id=$1`,
      [registered.user.id],
    );
    expect(throttledCount).toBe(1);
    await source.query(
      `UPDATE "${schema}".verification_codes SET created_at=now()-interval '61 seconds' WHERE user_id=$1`,
      [registered.user.id],
    );
    await service.sendVerification("resend@example.com");
    const records = await source.query(
      `SELECT consumed_at FROM "${schema}".verification_codes WHERE user_id=$1 ORDER BY created_at`,
      [registered.user.id],
    );
    expect(records).toHaveLength(2);
    expect(records[0].consumed_at).not.toBeNull();
    expect(records[1].consumed_at).toBeNull();
  });

  it("limits verification sends by target account across repeated requests", async () => {
    const registered = await service.register({
      email: "limited@example.com",
      password: "correct horse battery",
      displayName: "Limited",
    });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await source.query(
        `UPDATE "${schema}".verification_codes SET created_at=now()-interval '61 seconds' WHERE user_id=$1`,
        [registered.user.id],
      );
      await service.sendVerification(
        "limited@example.com",
        `192.0.2.${attempt}`,
      );
    }
    await expect(
      service.sendVerification("limited@example.com", "192.0.2.20"),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("atomically limits concurrent sends and expires the rolling window", async () => {
    const outcomes = await Promise.allSettled(
      Array.from({ length: 8 }, (_, index) =>
        service.sendVerification(
          "parallel@example.test",
          `198.51.100.${index}`,
        ),
      ),
    );
    expect(
      outcomes.filter((entry) => entry.status === "fulfilled"),
    ).toHaveLength(3);
    expect(
      outcomes.filter((entry) => entry.status === "rejected"),
    ).toHaveLength(5);
    await source.query(
      `UPDATE "${schema}".security_counters SET window_start=window_start-interval '16 minutes' WHERE scope='otp-email'`,
    );
    await expect(
      service.sendVerification("parallel@example.test", "198.51.100.30"),
    ).resolves.toBeUndefined();
  });

  it("limits an IP even when each request targets a different email", async () => {
    for (let index = 0; index < 10; index += 1) {
      await service.sendVerification(`ip-${index}@example.test`, "203.0.113.1");
    }
    await expect(
      service.sendVerification("ip-next@example.test", "203.0.113.1"),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("rejects verification after its session is revoked", async () => {
    const registered = await service.register({
      email: "revoked@example.test",
      password: "correct horse battery",
      displayName: "Revoked",
    });
    await service.logout(registered.refreshToken);
    await expect(
      service.confirmVerification(registered.accessToken, "123456"),
    ).rejects.toMatchObject({ code: "INVALID_ACCESS_TOKEN" });
  });

  it("rejects expired OTPs and locks a code after five wrong attempts", async () => {
    const registered = await service.register({
      email: "attempts@example.test",
      password: "correct horse battery",
      displayName: "Attempts",
    });
    for (let index = 0; index < 5; index += 1) {
      await expect(
        service.confirmVerification(registered.accessToken, "000000"),
      ).rejects.toMatchObject({ code: "INVALID_VERIFICATION_CODE" });
    }
    await expect(
      service.confirmVerification(registered.accessToken, "123456"),
    ).rejects.toMatchObject({ code: "INVALID_VERIFICATION_CODE" });
    await source.query(
      `UPDATE "${schema}".verification_codes SET attempts=0,expires_at=now()-interval '1 second' WHERE user_id=$1`,
      [registered.user.id],
    );
    await expect(
      service.confirmVerification(registered.accessToken, "123456"),
    ).rejects.toMatchObject({ code: "INVALID_VERIFICATION_CODE" });
  });
});
