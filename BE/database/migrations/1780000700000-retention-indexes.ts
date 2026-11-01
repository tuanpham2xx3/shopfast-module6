import { MigrationInterface, QueryRunner } from "typeorm";

export class RetentionIndexes1780000700000 implements MigrationInterface {
  async up(r: QueryRunner) {
    const s = (r.connection.options as { schema?: string }).schema ?? "public";
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(s)) throw new Error("Invalid schema");
    for (const [name, table, columns, predicate] of [
      ["retention_turns_idx", "ai_turns", "created_at,id", ""],
      ["retention_turn_session_idx", "ai_turns", "session_id", ""],
      [
        "retention_approved_turn_idx",
        "ticket_messages",
        "approved_ai_message_id",
        " WHERE approved_ai_message_id IS NOT NULL",
      ],
      ["retention_sessions_idx", "ai_sessions", "created_at,id", ""],
      ["retention_proposals_idx", "ai_proposals", "created_at,id", ""],
      ["retention_proposal_session_idx", "ai_proposals", "session_id", ""],
      [
        "retention_jobs_idx",
        "job_executions",
        "updated_at,business_key",
        " WHERE status='SUCCEEDED' AND payload<>'{}'::jsonb",
      ],
      ["retention_counters_idx", "security_counters", "window_start", ""],
      ["retention_idempotency_idx", "idempotency_records", "expires_at", ""],
    ])
      await r.query(
        `CREATE INDEX ${name} ON "${s}".${table}(${columns})${predicate}`,
      );
  }
  async down(r: QueryRunner) {
    const s = (r.connection.options as { schema?: string }).schema ?? "public";
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(s)) throw new Error("Invalid schema");
    for (const name of [
      "retention_turns_idx",
      "retention_turn_session_idx",
      "retention_approved_turn_idx",
      "retention_sessions_idx",
      "retention_proposals_idx",
      "retention_proposal_session_idx",
      "retention_jobs_idx",
      "retention_counters_idx",
      "retention_idempotency_idx",
    ])
      await r.query(`DROP INDEX "${s}".${name}`);
  }
}
