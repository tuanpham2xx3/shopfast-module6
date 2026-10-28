import { AuthService } from "../../libs/modules/auth/auth.service";
import * as argon2 from "argon2";
import jwt from "jsonwebtoken";
import { createHash, randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
const secret = "unit-auth-secret-at-least-32-characters";
const id = randomUUID(),
  sid = randomUUID();
const user = {
  id,
  email: "buyer@example.test",
  password_hash: "",
  display_name: "Buyer",
  role: "CUSTOMER",
  status: "ACTIVE",
  email_verified_at: new Date(),
};
function fixture(results: unknown[] = []) {
  const query = jest.fn();
  for (const result of results) query.mockResolvedValueOnce(result);
  query.mockResolvedValue([]);
  const source = {
    query,
    transaction: async (fn: (m: { query: typeof query }) => Promise<unknown>) =>
      fn({ query }),
  } as unknown as DataSource;
  return {
    query,
    auth: new AuthService(source, {
      accessTokenSecret: secret,
      codeGenerator: () => "123456",
    }),
  };
}
const token = () =>
  jwt.sign({ sid, role: "CUSTOMER" }, secret, {
    subject: id,
    issuer: "shopfast",
    audience: "shopfast-api",
    expiresIn: 900,
  });
describe("auth domain decisions independent of PostgreSQL", () => {
  it("resends verification only within email/IP quotas and respects cooldown without enumeration", async () => {
    const budget = [
      [],
      [{ count: 0, retry_after: 1 }],
      [],
      [],
      [{ count: 0, retry_after: 1 }],
      [],
      [],
    ];
    const unverified = { ...user, email_verified_at: null };
    await expect(
      fixture([...budget, [unverified], [], [], [], []]).auth.sendVerification(
        " BUYER@example.test ",
        "127.0.0.1",
      ),
    ).resolves.toBeUndefined();
    await expect(
      fixture([
        ...budget,
        [unverified],
        [{ created_at: new Date() }],
      ]).auth.sendVerification(user.email),
    ).resolves.toBeUndefined();
    await expect(
      fixture([...budget, []]).auth.sendVerification("unknown@example.test"),
    ).resolves.toBeUndefined();
    await expect(
      fixture([[], [{ count: 3, retry_after: 60 }]]).auth.sendVerification(
        user.email,
      ),
    ).rejects.toThrow("RATE_LIMITED");
    await expect(
      fixture([
        [],
        [{ count: 0, retry_after: 1 }],
        [],
        [],
        [{ count: 10, retry_after: 60 }],
      ]).auth.sendVerification(user.email),
    ).rejects.toThrow("RATE_LIMITED");
    await fixture([[[{ id: sid }]]]).auth.logout("opaque-refresh-token");
  });
  beforeAll(async () => {
    user.password_hash = await argon2.hash("CorrectPassword!2026");
  });
  it("registers normalized identity with hashed password and an opaque refresh token", async () => {
    const { auth } = fixture();
    const r = await auth.register({
      email: " NEW@Example.Test ",
      displayName: " Buyer ",
      password: "NewPassword!2026",
    });
    expect(r.user).toMatchObject({
      email: "new@example.test",
      displayName: "Buyer",
      verified: false,
      role: "CUSTOMER",
    });
    expect(r.verificationRequired).toBe(true);
    expect(r.refreshToken).toHaveLength(43);
    const claims = jwt.verify(r.accessToken, secret, {
      issuer: "shopfast",
      audience: "shopfast-api",
    }) as jwt.JwtPayload;
    expect(claims.sub).toBe(r.user.id);
    expect(claims.sid).toBeDefined();
    expect(JSON.stringify(r.user)).not.toMatch(/password|123456|refresh/);
  });
  it("maps duplicate registration while propagating infrastructure failures", async () => {
    const make = (error: unknown) =>
      new AuthService(
        {
          transaction: async () => {
            throw error;
          },
        } as unknown as DataSource,
        { accessTokenSecret: secret },
      );
    await expect(
      make({ code: "23505" }).register({
        email: "x@example.test",
        displayName: "X",
        password: "password",
      }),
    ).rejects.toThrow("EMAIL_ALREADY_REGISTERED");
    await expect(
      make(new Error("database unavailable")).register({
        email: "x@example.test",
        displayName: "X",
        password: "password",
      }),
    ).rejects.toThrow("database unavailable");
  });
  it("checks passwords, account status and signs the correct subject", async () => {
    const valid = fixture([[user]]);
    const r = await valid.auth.login(
      " BUYER@example.test ",
      "CorrectPassword!2026",
    );
    expect(r.user.id).toBe(id);
    expect((jwt.decode(r.accessToken) as jwt.JwtPayload).sub).toBe(id);
    await expect(
      fixture([[user]]).auth.login(user.email, "wrong"),
    ).rejects.toThrow("INVALID_CREDENTIALS");
    await expect(
      fixture([[{ ...user, status: "DISABLED" }]]).auth.login(
        user.email,
        "CorrectPassword!2026",
      ),
    ).rejects.toThrow("INVALID_CREDENTIALS");
    await expect(fixture([[]]).auth.login(user.email, "wrong")).rejects.toThrow(
      "INVALID_CREDENTIALS",
    );
  });
  it("rotates refresh tokens without making the session ID the user subject", async () => {
    const session = {
      ...user,
      id: sid,
      user_id: id,
      expires_at: new Date(Date.now() + 60000),
      revoked_at: null,
    };
    const r = await fixture([[session]]).auth.refresh("old-opaque-token");
    expect(r.refreshToken).not.toBe("old-opaque-token");
    expect(r.user.id).toBe(id);
    expect(jwt.decode(r.accessToken)).toMatchObject({ sub: id, sid });
    for (const changed of [
      { revoked_at: new Date() },
      { expires_at: new Date(0) },
      { status: "DISABLED" },
    ])
      await expect(
        fixture([[{ ...session, ...changed }]]).auth.refresh("old"),
      ).rejects.toThrow("INVALID_REFRESH_TOKEN");
    await expect(
      fixture([[], [{ token_family_id: randomUUID() }]]).auth.refresh("reused"),
    ).rejects.toThrow("REFRESH_TOKEN_REUSED");
    await expect(fixture([[], []]).auth.refresh("unknown")).rejects.toThrow(
      "INVALID_REFRESH_TOKEN",
    );
  });
  it("requires both signed claims and a live database session", async () => {
    expect((await fixture([[user]]).auth.currentUser(token())).id).toBe(id);
    await expect(fixture([[]]).auth.currentUser(token())).rejects.toThrow(
      "INVALID_ACCESS_TOKEN",
    );
    await expect(fixture().auth.currentUser("tampered")).rejects.toThrow(
      "INVALID_ACCESS_TOKEN",
    );
    expect(
      () => new AuthService({} as DataSource, { accessTokenSecret: "short" }),
    ).toThrow();
    expect(
      () =>
        new AuthService({} as DataSource, {
          accessTokenSecret: secret,
          schema: "bad;schema",
        }),
    ).toThrow();
  });
  it("only verifies a current unexpired code with attempts remaining", async () => {
    const row = {
      id: randomUUID(),
      attempts: 0,
      expires_at: new Date(Date.now() + 60000),
      code_hash: createHash("sha256")
        .update(`${id}:123456:${secret}`)
        .digest("hex"),
    };
    const unverified = { ...user, email_verified_at: null };
    const auth = fixture([
      [{ id: sid }],
      [unverified],
      [row],
      [],
      [],
      [user],
    ]).auth;
    expect((await auth.confirmVerification(token(), "123456")).verified).toBe(
      true,
    );
    for (const record of [
      { ...row, attempts: 5 },
      { ...row, expires_at: new Date(0) },
      { ...row, code_hash: "invalid" },
    ])
      await expect(
        fixture([
          [{ id: sid }],
          [unverified],
          [record],
        ]).auth.confirmVerification(token(), "123456"),
      ).rejects.toThrow("INVALID_VERIFICATION_CODE");
    await expect(
      fixture([[]]).auth.confirmVerification(token(), "123456"),
    ).rejects.toThrow("INVALID_ACCESS_TOKEN");
  });
});
