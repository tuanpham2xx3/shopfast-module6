import { DataSource } from "typeorm";

export class RetentionService {
  constructor(
    private readonly source: DataSource,
    private readonly schema = "public",
    private readonly clock = () => new Date(),
  ) {
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema))
      throw new Error("Invalid schema");
  }
  async cleanup(batchSize = 500): Promise<Record<string, number>> {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000)
      throw new Error("Invalid retention batch size");
    const now = this.clock();
    const day = 86400000;
    const t = (name: string) => `"${this.schema}".${name}`;
    return this.source.transaction(async (m) => {
      await m.query("SET LOCAL statement_timeout = '5s'");
      const [{ locked }] = await m.query(
        "SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) locked",
        [`${this.schema}:retention`],
      );
      if (!locked) return { skipped: 1 };
      const counts: Record<string, number> = {};
      async function run(name: string, sql: string, params: unknown[]) {
        const [row] = await m.query(
          `WITH changed AS (${sql} RETURNING 1) SELECT count(*)::integer count FROM changed`,
          params,
        );
        counts[name] = row.count;
      }
      const aiCutoff = new Date(now.getTime() - 30 * day);
      // Approved messages retain their FK/provenance, but not the old private prompt/draft.
      await run(
        "redactedTurns",
        `UPDATE ${t("ai_turns")} SET message='[REDACTED_BY_RETENTION]',response=NULL WHERE id IN (SELECT a.id FROM ${t("ai_turns")} a WHERE a.created_at<$1 AND (a.message<>'[REDACTED_BY_RETENTION]' OR a.response IS NOT NULL) AND EXISTS(SELECT 1 FROM ${t("ticket_messages")} m WHERE m.approved_ai_message_id=a.id) ORDER BY a.created_at,a.id LIMIT $2 FOR UPDATE OF a SKIP LOCKED)`,
        [aiCutoff, batchSize],
      );
      await run(
        "deletedTurns",
        `DELETE FROM ${t("ai_turns")} WHERE id IN (SELECT a.id FROM ${t("ai_turns")} a WHERE a.created_at<$1 AND NOT EXISTS(SELECT 1 FROM ${t("ticket_messages")} m WHERE m.approved_ai_message_id=a.id) ORDER BY a.created_at,a.id LIMIT $2 FOR UPDATE OF a SKIP LOCKED)`,
        [aiCutoff, batchSize],
      );
      await run(
        "deletedProposals",
        `DELETE FROM ${t("ai_proposals")} WHERE id IN (SELECT id FROM ${t("ai_proposals")} WHERE created_at<$1 AND expires_at<$2 ORDER BY created_at,id LIMIT $3 FOR UPDATE SKIP LOCKED)`,
        [aiCutoff, now, batchSize],
      );
      await run(
        "deletedSessions",
        `DELETE FROM ${t("ai_sessions")} WHERE id IN (SELECT s.id FROM ${t("ai_sessions")} s WHERE s.created_at<$1 AND s.expires_at<$2 AND NOT EXISTS(SELECT 1 FROM ${t("ai_turns")} a WHERE a.session_id=s.id) AND NOT EXISTS(SELECT 1 FROM ${t("ai_proposals")} p WHERE p.session_id=s.id) ORDER BY s.created_at,s.id LIMIT $3 FOR UPDATE OF s SKIP LOCKED)`,
        [aiCutoff, now, batchSize],
      );
      await run(
        "compactedJobs",
        `UPDATE ${t("job_executions")} SET payload='{}' WHERE business_key IN (SELECT business_key FROM ${t("job_executions")} WHERE status='SUCCEEDED' AND updated_at<$1 AND payload<>'{}'::jsonb ORDER BY updated_at,business_key LIMIT $2 FOR UPDATE SKIP LOCKED)`,
        [new Date(now.getTime() - 90 * day), batchSize],
      );
      await run(
        "deletedCounters",
        `DELETE FROM ${t("security_counters")} WHERE (scope,subject_hash,window_start) IN (SELECT scope,subject_hash,window_start FROM ${t("security_counters")} WHERE window_start<$1 AND (blocked_until IS NULL OR blocked_until<=$2) ORDER BY window_start LIMIT $3 FOR UPDATE SKIP LOCKED)`,
        [new Date(now.getTime() - day), now, batchSize],
      );
      await run(
        "deletedIdempotency",
        `DELETE FROM ${t("idempotency_records")} WHERE (user_id,route,key) IN (SELECT user_id,route,key FROM ${t("idempotency_records")} WHERE expires_at<$1 ORDER BY expires_at LIMIT $2 FOR UPDATE SKIP LOCKED)`,
        [now, batchSize],
      );
      return counts;
    });
  }
}
