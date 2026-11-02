import { EntityManager } from "typeorm";
type QueryExecutor = Pick<EntityManager, "query">;
/** SQL only; the caller owns transaction, lock ordering and commit. */
export class AiRepository {
  constructor(private readonly schema: string) {}
  private t(name: string) {
    return '\"' + this.schema + '\".' + name;
  }
  sessionAiSessionsSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT id,ticket_id AS "ticketId",actor_id AS "actorId",expires_at AS "expiresAt" FROM ${this.t("ai_sessions")} WHERE id=$1`,
      values,
    );
  }
  createSessionAiSessionsInsert(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `INSERT INTO ${this.t("ai_sessions")}(id,ticket_id,actor_id) VALUES($1,$2,$3) RETURNING id AS "sessionId",expires_at AS "expiresAt"`,
      values,
    );
  }
  executeMessageAiSessionsSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT id FROM ${this.t("ai_sessions")} WHERE id=$1 FOR UPDATE`,
      values,
    );
  }
  executeMessageAiTurnsSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT id,message,status,response,created_at FROM ${this.t("ai_turns")} WHERE session_id=$1 AND client_message_id=$2`,
      values,
    );
  }
  executeMessageAiTurnsUpdate(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `UPDATE ${this.t("ai_turns")} SET status='COMPLETED',response=$2 WHERE id=$1`,
      values,
    );
  }
  executeMessageAiTurnsSelect2(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT id FROM ${this.t("ai_turns")} WHERE session_id=$1 AND status='PROCESSING' AND created_at>now()-interval '30 seconds'`,
      values,
    );
  }
  executeMessageAiTurnsInsert(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `INSERT INTO ${this.t("ai_turns")}(id,session_id,client_message_id,message) VALUES($1,$2,$3,$4)`,
      values,
    );
  }
  executeMessageAiTurnsUpdate2(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `UPDATE ${this.t("ai_turns")} SET status='COMPLETED',response=$2 WHERE id=$1 AND status='PROCESSING'`,
      values,
    );
  }
  executeMessageAiTurnsSelect3(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT response FROM ${this.t("ai_turns")} WHERE id=$1`,
      values,
    );
  }
  runAiTurnsSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT message,response FROM ${this.t("ai_turns")} WHERE session_id=$1 AND status='COMPLETED' ORDER BY created_at DESC LIMIT 5`,
      values,
    );
  }
  toolLockSet(executor: QueryExecutor, values: unknown[]) {
    return executor.query("SET LOCAL statement_timeout = '2s'", values);
  }
  toolProductsSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT p.sku,p.name AS "productName",(i.on_hand-i.reserved) AS available,(p.active AND c.active AND b.active) AS active,i.version AS "inventoryVersion",now() AS "observedAt" FROM ${this.t("products")} p JOIN ${this.t("inventories")} i ON i.product_id=p.id JOIN ${this.t("categories")} c ON c.id=p.category_id JOIN ${this.t("brands")} b ON b.id=p.brand_id WHERE p.sku=$1`,
      values,
    );
  }
  toolAiProposalsInsert(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `INSERT INTO ${this.t("ai_proposals")}(id,session_id,ticket_id,actor_id,action,payload,expected_version) VALUES($1,$2,$3,$4,'SET_TICKET_CATEGORY',$5,$6) RETURNING id,payload,expected_version AS "expectedVersion",expires_at AS "expiresAt",status`,
      values,
    );
  }
  decideAiProposalsSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT * FROM ${this.t("ai_proposals")} WHERE id=$1 FOR UPDATE`,
      values,
    );
  }
  decideAiProposalsUpdate(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `UPDATE ${this.t("ai_proposals")} SET status='REJECTED' WHERE id=$1`,
      values,
    );
  }
  decideTicketsUpdate(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `UPDATE ${this.t("tickets")} SET category=$2,classification_source='HUMAN',classification_status='COMPLETED',needs_review=false,version=version+1,updated_at=now() WHERE id=$1`,
      values,
    );
  }
  decideAiProposalsUpdate2(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `UPDATE ${this.t("ai_proposals")} SET status='EXECUTED',result=$2 WHERE id=$1`,
      values,
    );
  }
  classifyTicketsUpdate(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `UPDATE ${this.t("tickets")} SET category=$3,confidence=$4,classification_reason=$5,classification_status=$6,needs_review=$7,version=version+1,updated_at=now() WHERE id=$1 AND classification_version=$2 AND classification_source<>'HUMAN' AND classification_status='PENDING'`,
      values,
    );
  }
}
