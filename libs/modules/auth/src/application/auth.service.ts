import {
  AuthError,
  Options,
  UserRow,
  PublicUser,
  AuthResult,
} from "../auth.contracts";
import { AuthRepository } from "../persistence/auth.repository";
import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import * as argon2 from "argon2";
import * as jwt from "jsonwebtoken";
import { DataSource, EntityManager } from "typeorm";
import { enqueueOutbox } from "../../../../platform/src/outbox/outbox";
import { domainEvents } from "../../../../platform/src/domain-events";

const DUMMY_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$u4tn5/QBkajPFwbV7vg+fw$1RGvrL5mH3lKeiXS1ZEx5Ji+x5lLmXyIj8emT0XhWd4";

export class AuthService {
  private readonly repository: AuthRepository;
  private readonly schema: string;
  private readonly generateCode: () => string;
  constructor(
    private readonly source: DataSource,
    private readonly options: Options,
  ) {
    this.schema = options.schema ?? "public";
    this.repository = new AuthRepository(this.schema);
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(this.schema))
      throw new Error("Invalid auth schema");
    if (options.accessTokenSecret.length < 32)
      throw new Error(
        "Access token secret must contain at least 32 characters",
      );
    this.generateCode =
      options.codeGenerator ??
      (() => randomInt(0, 1_000_000).toString().padStart(6, "0"));
  }

  private hash(value: string) {
    return createHash("sha256").update(value).digest("hex");
  }
  private publicUser(row: UserRow): PublicUser {
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      verified: Boolean(row.email_verified_at),
    };
  }
  private access(row: UserRow, sessionId: string) {
    return jwt.sign(
      { role: row.role, sid: sessionId },
      this.options.accessTokenSecret,
      {
        algorithm: "HS256",
        subject: row.id,
        expiresIn: "15m",
        issuer: "shopfast",
        audience: "shopfast-api",
      },
    );
  }
  private readAccess(token: string): jwt.JwtPayload {
    try {
      return jwt.verify(token, this.options.accessTokenSecret, {
        algorithms: ["HS256"],
        issuer: "shopfast",
        audience: "shopfast-api",
      }) as jwt.JwtPayload;
    } catch {
      throw new AuthError("INVALID_ACCESS_TOKEN");
    }
  }
  private async createSession(
    manager: EntityManager,
    row: UserRow,
  ): Promise<AuthResult> {
    const sessionId = randomUUID();
    const refreshToken = randomBytes(32).toString("base64url");
    await this.repository.insertSession(manager, [
      sessionId,
      row.id,
      randomUUID(),
      this.hash(refreshToken),
    ]);
    return {
      accessToken: this.access(row, sessionId),
      expiresIn: 900,
      refreshToken,
      user: this.publicUser(row),
    };
  }
  async register(input: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<AuthResult> {
    const email = input.email.trim().toLowerCase();
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });
    const code = this.generateCode();
    try {
      return await this.source.transaction(async (manager) => {
        const user: UserRow = {
          id: randomUUID(),
          email,
          password_hash: passwordHash,
          display_name: input.displayName.trim(),
          role: "CUSTOMER",
          status: "ACTIVE",
          email_verified_at: null,
        };
        await this.repository.insertUser(manager, [
          user.id,
          user.email,
          user.password_hash,
          user.display_name,
        ]);
        const codeId = randomUUID();
        await this.repository.insertVerification(manager, [
          codeId,
          user.id,
          this.hash(`${user.id}:${code}:${this.options.accessTokenSecret}`),
        ]);
        await enqueueOutbox(
          manager,
          {
            id: randomUUID(),
            businessKey: `verification:${codeId}`,
            type: "auth.email",
            aggregateId: user.id,
            payload: { template: "verify-email", recipient: email, code },
          },
          this.schema,
        );
        return {
          ...(await this.createSession(manager, user)),
          verificationRequired: true,
        };
      });
    } catch (error) {
      if ((error as { code?: string }).code === "23505")
        throw new AuthError("EMAIL_ALREADY_REGISTERED");
      throw error;
    }
  }
  async confirmVerification(
    accessToken: string,
    code: string,
  ): Promise<PublicUser> {
    const claims = this.readAccess(accessToken);
    const result = await this.source.transaction(async (manager) => {
      const [session] = await this.repository.lockActiveSession(manager, [
        claims.sid,
        claims.sub,
      ]);
      if (!session) throw new AuthError("INVALID_ACCESS_TOKEN");
      const [user]: UserRow[] = await this.repository.lockUser(manager, [
        claims.sub,
      ]);
      if (!user || user.status !== "ACTIVE")
        throw new AuthError("INVALID_ACCESS_TOKEN");
      if (user.email_verified_at) return null;
      const [record] = await this.repository.lockLatestVerification(manager, [
        user.id,
      ]);
      const valid =
        record &&
        record.attempts < 5 &&
        new Date(record.expires_at) > new Date() &&
        record.code_hash ===
          this.hash(`${user.id}:${code}:${this.options.accessTokenSecret}`);
      if (!valid) {
        if (record && record.attempts < 5)
          await this.repository.incrementVerificationAttempts(manager, [
            record.id,
          ]);
        return null;
      }
      await this.repository.consumeVerification(manager, [record.id]);
      await this.repository.verifyUserEmail(manager, [user.id]);
      const [updated]: UserRow[] = await this.repository.userById(manager, [
        user.id,
      ]);
      return updated;
    });
    if (!result) throw new AuthError("INVALID_VERIFICATION_CODE");
    return this.publicUser(result);
  }
  async login(rawEmail: string, password: string): Promise<AuthResult> {
    const [user]: UserRow[] = await this.repository.userByEmail(this.source, [
      rawEmail.trim().toLowerCase(),
    ]);
    const correct = await argon2.verify(
      user?.password_hash ?? DUMMY_HASH,
      password,
    );
    if (!user || !correct || user.status !== "ACTIVE")
      throw new AuthError("INVALID_CREDENTIALS");
    return this.source.transaction((manager) =>
      this.createSession(manager, user),
    );
  }
  async refresh(refreshToken: string): Promise<AuthResult> {
    const tokenHash = this.hash(refreshToken);
    const outcome = await this.source.transaction(async (manager) => {
      const [session] = await this.repository.lockRefreshSession(manager, [
        tokenHash,
      ]);
      if (session) {
        if (
          session.revoked_at ||
          new Date(session.expires_at) <= new Date() ||
          session.status !== "ACTIVE"
        )
          return { kind: "invalid" as const };
        const nextToken = randomBytes(32).toString("base64url");
        await this.repository.rememberRefreshToken(manager, [
          randomUUID(),
          session.id,
          tokenHash,
          session.expires_at,
        ]);
        await this.repository.rotateRefreshToken(manager, [
          this.hash(nextToken),
          session.id,
        ]);
        return {
          kind: "ok" as const,
          value: {
            accessToken: this.access(
              { ...session, id: session.user_id },
              session.id,
            ),
            expiresIn: 900,
            refreshToken: nextToken,
            user: this.publicUser({ ...session, id: session.user_id }),
          },
        };
      }
      const [used] = await this.repository.lockReusedTokenFamily(manager, [
        tokenHash,
      ]);
      if (!used) return { kind: "invalid" as const };
      await this.repository.revokeTokenFamily(manager, [used.token_family_id]);
      return { kind: "reused" as const };
    });
    if (outcome.kind === "reused") throw new AuthError("REFRESH_TOKEN_REUSED");
    if (outcome.kind === "invalid")
      throw new AuthError("INVALID_REFRESH_TOKEN");
    return outcome.value;
  }

  async currentUser(accessToken: string): Promise<PublicUser> {
    const claims = this.readAccess(accessToken);
    const [user]: UserRow[] = await this.repository.activePrincipal(
      this.source,
      [claims.sub, claims.sid],
    );
    if (!user) throw new AuthError("INVALID_ACCESS_TOKEN");
    return this.publicUser(user);
  }

  async logout(refreshToken: string): Promise<void> {
    const [rows] = await this.repository.revokeRefreshSession(this.source, [
      this.hash(refreshToken),
    ]);
    for (const session of rows)
      domainEvents.emit("session.revoked", session.id);
  }

  async sendVerification(
    rawEmail: string,
    clientIp = "unknown",
  ): Promise<void> {
    const email = rawEmail.trim().toLowerCase();
    await this.source.transaction(async (manager) => {
      const limits = [
        { scope: "otp-email", subject: email, limit: 3 },
        { scope: "otp-ip", subject: clientIp, limit: 10 },
      ];
      for (const entry of limits) {
        const subject = this.hash(entry.subject);
        await this.repository.lockVerificationThrottle(manager, [
          `${this.schema}:${entry.scope}:${subject}`,
        ]);
        const [usage] = await this.repository.verificationThrottle(manager, [
          entry.scope,
          subject,
        ]);
        if (usage.count >= entry.limit)
          throw new AuthError("RATE_LIMITED", usage.retry_after);
        await this.repository.insertVerificationCounter(manager, [
          entry.scope,
          subject,
        ]);
      }
      await this.repository.pruneVerificationCounters(manager, []);
    });
    await this.source.transaction(async (manager) => {
      const [user]: UserRow[] = await this.repository.lockVerificationUser(
        manager,
        [email],
      );
      if (!user || user.email_verified_at || user.status !== "ACTIVE") return;
      const [latest] = await this.repository.latestVerification(manager, [
        user.id,
      ]);
      if (latest && Date.now() - new Date(latest.created_at).getTime() < 60_000)
        return;
      await this.repository.consumeOldVerifications(manager, [user.id]);
      const code = this.generateCode();
      const codeId = randomUUID();
      await this.repository.insertNewVerification(manager, [
        codeId,
        user.id,
        this.hash(`${user.id}:${code}:${this.options.accessTokenSecret}`),
      ]);
      await enqueueOutbox(
        manager,
        {
          id: randomUUID(),
          businessKey: `verification:${codeId}`,
          type: "auth.email",
          aggregateId: user.id,
          payload: { template: "verify-email", recipient: email, code },
        },
        this.schema,
      );
    });
  }
}
