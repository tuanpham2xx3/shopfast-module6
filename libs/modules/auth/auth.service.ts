import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import * as argon2 from "argon2";
import * as jwt from "jsonwebtoken";
import { DataSource, EntityManager } from "typeorm";
import { enqueueOutbox } from "../../platform/src/outbox/outbox";
import { domainEvents } from "../../platform/src/domain-events";

const DUMMY_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$u4tn5/QBkajPFwbV7vg+fw$1RGvrL5mH3lKeiXS1ZEx5Ji+x5lLmXyIj8emT0XhWd4";
export class AuthError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryAfter?: number,
  ) {
    super(code);
  }
}
interface Options {
  accessTokenSecret: string;
  schema?: string;
  codeGenerator?: () => string;
}
interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  role: string;
  status: string;
  email_verified_at: Date | null;
}
export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  verified: boolean;
}
export interface AuthResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  user: PublicUser;
  verificationRequired?: boolean;
}

export class AuthService {
  private readonly schema: string;
  private readonly generateCode: () => string;
  constructor(
    private readonly source: DataSource,
    private readonly options: Options,
  ) {
    this.schema = options.schema ?? "public";
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
  private table(name: string) {
    return `"${this.schema}".${name}`;
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
    await manager.query(
      `INSERT INTO ${this.table("auth_sessions")} (id,user_id,token_family_id,refresh_hash,expires_at) VALUES ($1,$2,$3,$4,now()+interval '7 days')`,
      [sessionId, row.id, randomUUID(), this.hash(refreshToken)],
    );
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
        await manager.query(
          `INSERT INTO ${this.table("users")} (id,email,password_hash,display_name,role) VALUES ($1,$2,$3,$4,'CUSTOMER')`,
          [user.id, user.email, user.password_hash, user.display_name],
        );
        const codeId = randomUUID();
        await manager.query(
          `INSERT INTO ${this.table("verification_codes")} (id,user_id,code_hash,expires_at) VALUES ($1,$2,$3,now()+interval '10 minutes')`,
          [
            codeId,
            user.id,
            this.hash(`${user.id}:${code}:${this.options.accessTokenSecret}`),
          ],
        );
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
      const [session] = await manager.query(
        `SELECT id FROM ${this.table("auth_sessions")} WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now() FOR UPDATE`,
        [claims.sid, claims.sub],
      );
      if (!session) throw new AuthError("INVALID_ACCESS_TOKEN");
      const [user]: UserRow[] = await manager.query(
        `SELECT * FROM ${this.table("users")} WHERE id=$1 FOR UPDATE`,
        [claims.sub],
      );
      if (!user || user.status !== "ACTIVE")
        throw new AuthError("INVALID_ACCESS_TOKEN");
      if (user.email_verified_at) return null;
      const [record] = await manager.query(
        `SELECT * FROM ${this.table("verification_codes")} WHERE user_id=$1 AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [user.id],
      );
      const valid =
        record &&
        record.attempts < 5 &&
        new Date(record.expires_at) > new Date() &&
        record.code_hash ===
          this.hash(`${user.id}:${code}:${this.options.accessTokenSecret}`);
      if (!valid) {
        if (record && record.attempts < 5)
          await manager.query(
            `UPDATE ${this.table("verification_codes")} SET attempts=attempts+1 WHERE id=$1`,
            [record.id],
          );
        return null;
      }
      await manager.query(
        `UPDATE ${this.table("verification_codes")} SET consumed_at=now() WHERE id=$1`,
        [record.id],
      );
      await manager.query(
        `UPDATE ${this.table("users")} SET email_verified_at=now(),updated_at=now() WHERE id=$1`,
        [user.id],
      );
      const [updated]: UserRow[] = await manager.query(
        `SELECT * FROM ${this.table("users")} WHERE id=$1`,
        [user.id],
      );
      return updated;
    });
    if (!result) throw new AuthError("INVALID_VERIFICATION_CODE");
    return this.publicUser(result);
  }
  async login(rawEmail: string, password: string): Promise<AuthResult> {
    const [user]: UserRow[] = await this.source.query(
      `SELECT * FROM ${this.table("users")} WHERE email=$1`,
      [rawEmail.trim().toLowerCase()],
    );
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
      const [session] = await manager.query(
        `SELECT s.*,u.email,u.password_hash,u.display_name,u.role,u.status,u.email_verified_at FROM ${this.table("auth_sessions")} s JOIN ${this.table("users")} u ON u.id=s.user_id WHERE s.refresh_hash=$1 FOR UPDATE OF s`,
        [tokenHash],
      );
      if (session) {
        if (
          session.revoked_at ||
          new Date(session.expires_at) <= new Date() ||
          session.status !== "ACTIVE"
        )
          return { kind: "invalid" as const };
        const nextToken = randomBytes(32).toString("base64url");
        await manager.query(
          `INSERT INTO ${this.table("refresh_token_history")} (id,session_id,token_hash,expires_at) VALUES ($1,$2,$3,$4)`,
          [randomUUID(), session.id, tokenHash, session.expires_at],
        );
        await manager.query(
          `UPDATE ${this.table("auth_sessions")} SET refresh_hash=$1,updated_at=now() WHERE id=$2`,
          [this.hash(nextToken), session.id],
        );
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
      const [used] = await manager.query(
        `SELECT s.token_family_id FROM ${this.table("refresh_token_history")} h JOIN ${this.table("auth_sessions")} s ON s.id=h.session_id WHERE h.token_hash=$1 FOR UPDATE OF s`,
        [tokenHash],
      );
      if (!used) return { kind: "invalid" as const };
      await manager.query(
        `UPDATE ${this.table("auth_sessions")} SET revoked_at=COALESCE(revoked_at,now()),updated_at=now() WHERE token_family_id=$1`,
        [used.token_family_id],
      );
      return { kind: "reused" as const };
    });
    if (outcome.kind === "reused") throw new AuthError("REFRESH_TOKEN_REUSED");
    if (outcome.kind === "invalid")
      throw new AuthError("INVALID_REFRESH_TOKEN");
    return outcome.value;
  }

  async currentUser(accessToken: string): Promise<PublicUser> {
    const claims = this.readAccess(accessToken);
    const [user]: UserRow[] = await this.source.query(
      `SELECT u.* FROM ${this.table("users")} u JOIN ${this.table("auth_sessions")} s ON s.user_id=u.id WHERE u.id=$1 AND s.id=$2 AND u.status='ACTIVE' AND s.revoked_at IS NULL AND s.expires_at>now()`,
      [claims.sub, claims.sid],
    );
    if (!user) throw new AuthError("INVALID_ACCESS_TOKEN");
    return this.publicUser(user);
  }

  async logout(refreshToken: string): Promise<void> {
    const [rows] = await this.source.query(
      `UPDATE ${this.table("auth_sessions")} SET revoked_at=COALESCE(revoked_at,now()),updated_at=now() WHERE refresh_hash=$1 RETURNING id`,
      [this.hash(refreshToken)],
    );
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
        await manager.query(
          `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,
          [`${this.schema}:${entry.scope}:${subject}`],
        );
        const [usage] = await manager.query(
          `SELECT COALESCE(sum(count),0)::int count, GREATEST(1,ceil(extract(epoch FROM min(window_start)+interval '15 minutes'-clock_timestamp())))::int retry_after FROM ${this.table("security_counters")} WHERE scope=$1 AND subject_hash=$2 AND window_start>clock_timestamp()-interval '15 minutes'`,
          [entry.scope, subject],
        );
        if (usage.count >= entry.limit)
          throw new AuthError("RATE_LIMITED", usage.retry_after);
        await manager.query(
          `INSERT INTO ${this.table("security_counters")} (scope,subject_hash,count) VALUES ($1,$2,1)`,
          [entry.scope, subject],
        );
      }
      await manager.query(
        `DELETE FROM ${this.table("security_counters")} WHERE window_start<clock_timestamp()-interval '30 minutes'`,
      );
    });
    await this.source.transaction(async (manager) => {
      const [user]: UserRow[] = await manager.query(
        `SELECT * FROM ${this.table("users")} WHERE email=$1 FOR UPDATE`,
        [email],
      );
      if (!user || user.email_verified_at || user.status !== "ACTIVE") return;
      const [latest] = await manager.query(
        `SELECT * FROM ${this.table("verification_codes")} WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [user.id],
      );
      if (latest && Date.now() - new Date(latest.created_at).getTime() < 60_000)
        return;
      await manager.query(
        `UPDATE ${this.table("verification_codes")} SET consumed_at=COALESCE(consumed_at,now()) WHERE user_id=$1`,
        [user.id],
      );
      const code = this.generateCode();
      const codeId = randomUUID();
      await manager.query(
        `INSERT INTO ${this.table("verification_codes")} (id,user_id,code_hash,expires_at) VALUES ($1,$2,$3,now()+interval '10 minutes')`,
        [
          codeId,
          user.id,
          this.hash(`${user.id}:${code}:${this.options.accessTokenSecret}`),
        ],
      );
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
