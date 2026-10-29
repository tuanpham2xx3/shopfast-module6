import { EntityManager } from "typeorm";
type QueryExecutor = Pick<EntityManager, "query">;
/** Uses caller-owned transaction managers; never commits independently. */
export class AuthRepository {
  constructor(private readonly schema: string) {}
  private table(name: string) {
    return `"${this.schema}".${name}`;
  }
  insertSession(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `INSERT INTO ${this.table("auth_sessions")} (id,user_id,token_family_id,refresh_hash,expires_at) VALUES ($1,$2,$3,$4,now()+interval '7 days')`,
      values,
    );
  }
  insertUser(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `INSERT INTO ${this.table("users")} (id,email,password_hash,display_name,role) VALUES ($1,$2,$3,$4,'CUSTOMER')`,
      values,
    );
  }
  insertVerification(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `INSERT INTO ${this.table("verification_codes")} (id,user_id,code_hash,expires_at) VALUES ($1,$2,$3,now()+interval '10 minutes')`,
      values,
    );
  }
  lockActiveSession(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `SELECT id FROM ${this.table("auth_sessions")} WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now() FOR UPDATE`,
      values,
    );
  }
  lockUser(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `SELECT * FROM ${this.table("users")} WHERE id=$1 FOR UPDATE`,
      values,
    );
  }
  lockLatestVerification(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `SELECT * FROM ${this.table("verification_codes")} WHERE user_id=$1 AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      values,
    );
  }
  incrementVerificationAttempts(
    executor: QueryExecutor,
    values: unknown[] = [],
  ) {
    return executor.query(
      `UPDATE ${this.table("verification_codes")} SET attempts=attempts+1 WHERE id=$1`,
      values,
    );
  }
  consumeVerification(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `UPDATE ${this.table("verification_codes")} SET consumed_at=now() WHERE id=$1`,
      values,
    );
  }
  verifyUserEmail(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `UPDATE ${this.table("users")} SET email_verified_at=now(),updated_at=now() WHERE id=$1`,
      values,
    );
  }
  userById(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `SELECT * FROM ${this.table("users")} WHERE id=$1`,
      values,
    );
  }
  userByEmail(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `SELECT * FROM ${this.table("users")} WHERE email=$1`,
      values,
    );
  }
  lockRefreshSession(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `SELECT s.*,u.email,u.password_hash,u.display_name,u.role,u.status,u.email_verified_at FROM ${this.table("auth_sessions")} s JOIN ${this.table("users")} u ON u.id=s.user_id WHERE s.refresh_hash=$1 FOR UPDATE OF s`,
      values,
    );
  }
  rememberRefreshToken(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `INSERT INTO ${this.table("refresh_token_history")} (id,session_id,token_hash,expires_at) VALUES ($1,$2,$3,$4)`,
      values,
    );
  }
  rotateRefreshToken(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `UPDATE ${this.table("auth_sessions")} SET refresh_hash=$1,updated_at=now() WHERE id=$2`,
      values,
    );
  }
  lockReusedTokenFamily(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `SELECT s.token_family_id FROM ${this.table("refresh_token_history")} h JOIN ${this.table("auth_sessions")} s ON s.id=h.session_id WHERE h.token_hash=$1 FOR UPDATE OF s`,
      values,
    );
  }
  revokeTokenFamily(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `UPDATE ${this.table("auth_sessions")} SET revoked_at=COALESCE(revoked_at,now()),updated_at=now() WHERE token_family_id=$1`,
      values,
    );
  }
  activePrincipal(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `SELECT u.* FROM ${this.table("users")} u JOIN ${this.table("auth_sessions")} s ON s.user_id=u.id WHERE u.id=$1 AND s.id=$2 AND u.status='ACTIVE' AND s.revoked_at IS NULL AND s.expires_at>now()`,
      values,
    );
  }
  revokeRefreshSession(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `UPDATE ${this.table("auth_sessions")} SET revoked_at=COALESCE(revoked_at,now()),updated_at=now() WHERE refresh_hash=$1 RETURNING id`,
      values,
    );
  }
  lockVerificationThrottle(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,
      values,
    );
  }
  verificationThrottle(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `SELECT COALESCE(sum(count),0)::int count, GREATEST(1,ceil(extract(epoch FROM min(window_start)+interval '15 minutes'-clock_timestamp())))::int retry_after FROM ${this.table("security_counters")} WHERE scope=$1 AND subject_hash=$2 AND window_start>clock_timestamp()-interval '15 minutes'`,
      values,
    );
  }
  insertVerificationCounter(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `INSERT INTO ${this.table("security_counters")} (scope,subject_hash,count) VALUES ($1,$2,1)`,
      values,
    );
  }
  pruneVerificationCounters(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `DELETE FROM ${this.table("security_counters")} WHERE window_start<clock_timestamp()-interval '30 minutes'`,
      values,
    );
  }
  lockVerificationUser(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `SELECT * FROM ${this.table("users")} WHERE email=$1 FOR UPDATE`,
      values,
    );
  }
  latestVerification(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `SELECT * FROM ${this.table("verification_codes")} WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      values,
    );
  }
  consumeOldVerifications(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `UPDATE ${this.table("verification_codes")} SET consumed_at=COALESCE(consumed_at,now()) WHERE user_id=$1`,
      values,
    );
  }
  insertNewVerification(executor: QueryExecutor, values: unknown[] = []) {
    return executor.query(
      `INSERT INTO ${this.table("verification_codes")} (id,user_id,code_hash,expires_at) VALUES ($1,$2,$3,now()+interval '10 minutes')`,
      values,
    );
  }
}
