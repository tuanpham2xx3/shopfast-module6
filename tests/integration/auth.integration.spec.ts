import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import { createDataSource } from "../../libs/platform/src/database/data-source";
import { AuthError, AuthService } from "../../libs/modules/auth/auth.service";

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
});
