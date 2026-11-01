import type { Actor } from "../tickets.contracts";
import { EntityManager } from "typeorm";
type QueryExecutor = Pick<EntityManager, "query">;
/** SQL only; the caller owns transaction, lock ordering and commit. */
export class TicketsRepository {
  constructor(private readonly schema: string) {}
  private t(name: string) {
    return '\"' + this.schema + '\".' + name;
  }
  ticketTicketsSelect(
    executor: QueryExecutor,
    values: unknown[],
    lock: boolean,
  ) {
    return executor.query(
      `SELECT id,customer_id AS "customerId",order_id AS "orderId",subject,body,status,assigned_to AS "assignedTo",category,version,resolved_at AS "resolvedAt",classification_version AS "classificationVersion",classification_source AS "classificationSource" FROM ${this.t("tickets")} WHERE id=$1 ${lock ? "FOR UPDATE" : ""}`,
      values,
    );
  }
  auditTicketAuditInsert(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `INSERT INTO ${this.t("ticket_audit")}(id,ticket_id,actor_id,action,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6)`,
      values,
    );
  }
  createOrdersSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT id FROM ${this.t("orders")} WHERE id=$1 AND customer_id=$2`,
      values,
    );
  }
  createTicketsInsert(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `INSERT INTO ${this.t("tickets")}(id,customer_id,order_id,subject,body) VALUES($1,$2,$3,$4,$5)`,
      values,
    );
  }
  listTicketsSelect(executor: QueryExecutor, values: unknown[], where: string) {
    return executor.query(
      `SELECT count(*)::int total FROM ${this.t("tickets")} ${where}`,
      values,
    );
  }
  listTicketsSelect2(
    executor: QueryExecutor,
    values: unknown[],
    where: string,
    valueCount: number,
  ) {
    return executor.query(
      `SELECT id,subject,status,category,assigned_to AS "assignedTo",classification_status AS "classificationStatus",needs_review AS "needsReview",version,created_at AS "createdAt" FROM ${this.t("tickets")} ${where} ORDER BY created_at DESC,id LIMIT $${valueCount - 1} OFFSET $${valueCount}`,
      values,
    );
  }
  detailTicketMessagesSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT id,author_id AS "authorId",body,approved_ai_message_id AS "approvedAiMessageId",created_at AS "createdAt" FROM ${this.t("ticket_messages")} WHERE ticket_id=$1 ORDER BY created_at,id LIMIT $2 OFFSET $3`,
      values,
    );
  }
  detailTicketMessagesSelect2(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT count(*)::int total FROM ${this.t("ticket_messages")} WHERE ticket_id=$1`,
      values,
    );
  }
  claimUsersSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT id FROM ${this.t("users")} WHERE id=$1 AND role IN ('SUPPORT','ADMIN') AND status='ACTIVE'`,
      values,
    );
  }
  claimTicketsUpdate(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `UPDATE ${this.t("tickets")} SET assigned_to=$2,version=version+1,updated_at=now() WHERE id=$1`,
      values,
    );
  }
  updateTicketsUpdate(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `UPDATE ${this.t("tickets")} SET status=COALESCE($2,status),category=COALESCE($3,category),classification_source=CASE WHEN $3::text IS NULL THEN classification_source ELSE 'HUMAN' END,classification_status=CASE WHEN $3::text IS NULL THEN classification_status ELSE 'COMPLETED' END,needs_review=CASE WHEN $3::text IS NULL THEN needs_review ELSE false END,resolved_at=CASE WHEN $2='RESOLVED' THEN now() WHEN $2='OPEN' THEN NULL ELSE resolved_at END,version=version+1,updated_at=now() WHERE id=$1`,
      values,
    );
  }
  messageAiTurnsSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT x.response FROM ${this.t("ai_turns")} x JOIN ${this.t("ai_sessions")} s ON s.id=x.session_id WHERE x.id=$1 AND s.ticket_id=$2 AND s.actor_id=$3 AND x.status='COMPLETED' FOR UPDATE OF x`,
      values,
    );
  }
  messageTicketMessagesInsert(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `INSERT INTO ${this.t("ticket_messages")}(id,ticket_id,author_id,body,approved_ai_message_id) VALUES($1,$2,$3,$4,$5) RETURNING id,body,created_at AS "createdAt"`,
      values,
    );
  }
  orderOrdersSelect(
    executor: QueryExecutor,
    values: unknown[],
    byCode: boolean,
    hasOrder: boolean,
  ) {
    return executor.query(
      `SELECT id,code AS "orderCode",status,payment_status AS "paymentStatus",updated_at AS "updatedAt",version FROM ${this.t("orders")} WHERE customer_id=$1 AND ${byCode ? "code=$2" : "id=$2"} ${hasOrder ? "AND id=$3" : ""}`,
      values,
    );
  }
  async list(
    executor: QueryExecutor,
    a: Actor,
    q: { status?: string; category?: string; assignedTo?: string },
    page: number,
    pageSize: number,
  ) {
    const args: unknown[] = [];
    const filters: string[] = [];
    const add = (sql: string, v: unknown) => {
      args.push(v);
      filters.push(`${sql}$${args.length}`);
    };
    if (a.role === "CUSTOMER") add("customer_id=", a.id);
    else if (a.role === "SUPPORT") {
      args.push(a.id);
      filters.push(`(assigned_to IS NULL OR assigned_to=$${args.length})`);
    }
    if (q.status) add("status=", q.status);
    if (q.category) add("category=", q.category);
    if (q.assignedTo) add("assigned_to=", q.assignedTo);
    const where = filters.length ? "WHERE " + filters.join(" AND ") : "";
    const [count] = await this.listTicketsSelect(executor, args, where);
    args.push(pageSize, (page - 1) * pageSize);
    const items = await this.listTicketsSelect2(
      executor,
      args,
      where,
      args.length,
    );
    return { items, page, pageSize, total: count.total };
  }
}
