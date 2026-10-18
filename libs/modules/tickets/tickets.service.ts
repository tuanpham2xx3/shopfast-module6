import { randomUUID } from "node:crypto";
import { DataSource, EntityManager } from "typeorm";
import { enqueueOutbox } from "../../platform/src/outbox/outbox";
export const categories = [
  "ORDER_STATUS",
  "PAYMENT",
  "INVENTORY",
  "DELIVERY",
  "CANCELLATION",
  "OTHER",
] as const;
export interface Actor {
  id: string;
  role: string;
  verified?: boolean;
}
export interface Ticket {
  id: string;
  customerId: string;
  orderId: string | null;
  subject: string;
  body: string;
  status: string;
  assignedTo: string | null;
  category: string;
  version: number;
  resolvedAt: Date | null;
  classificationVersion: number;
  classificationSource: string;
}
export class TicketError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
export class TicketsService {
  constructor(
    public readonly source: DataSource,
    public readonly schema = "public",
  ) {
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw Error("Invalid schema");
  }
  t(n: string) {
    return `"${this.schema}".${n}`;
  }
  async ticket(
    id: string,
    m: EntityManager = this.source.manager,
    lock = false,
  ): Promise<Ticket> {
    const [r] = await m.query(
      `SELECT id,customer_id AS "customerId",order_id AS "orderId",subject,body,status,assigned_to AS "assignedTo",category,version,resolved_at AS "resolvedAt",classification_version AS "classificationVersion",classification_source AS "classificationSource" FROM ${this.t("tickets")} WHERE id=$1 ${lock ? "FOR UPDATE" : ""}`,
      [id],
    );
    if (!r) throw new TicketError("NOT_FOUND");
    return r;
  }
  authorize(t: Ticket, a: Actor, assigned = false) {
    if (a.role === "CUSTOMER") {
      if (t.customerId !== a.id) throw new TicketError("NOT_FOUND");
      return;
    }
    if (a.role === "ADMIN") return;
    if (
      a.role !== "SUPPORT" ||
      (assigned
        ? t.assignedTo !== a.id
        : t.assignedTo !== null && t.assignedTo !== a.id)
    )
      throw new TicketError("FORBIDDEN");
  }
  version(t: Ticket, v: number) {
    if (t.version !== v) throw new TicketError("VERSION_CONFLICT");
  }
  async audit(
    m: EntityManager,
    t: Ticket,
    a: Actor | null,
    action: string,
    after: unknown,
  ) {
    await m.query(
      `INSERT INTO ${this.t("ticket_audit")}(id,ticket_id,actor_id,action,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6)`,
      [
        randomUUID(),
        t.id,
        a?.id ?? null,
        action,
        JSON.stringify(t),
        JSON.stringify(after),
      ],
    );
  }
  async create(
    a: Actor,
    d: { subject: string; body: string; orderId?: string },
  ) {
    if (a.role !== "CUSTOMER") throw new TicketError("FORBIDDEN");
    if (
      d.subject.trim().length < 5 ||
      d.subject.length > 150 ||
      !d.body.trim() ||
      d.body.length > 4000
    )
      throw new TicketError("BAD_REQUEST");
    return this.source.transaction(async (m) => {
      if (d.orderId) {
        const [o] = await m.query(
          `SELECT id FROM ${this.t("orders")} WHERE id=$1 AND customer_id=$2`,
          [d.orderId, a.id],
        );
        if (!o) throw new TicketError("ORDER_NOT_ACCESSIBLE");
      }
      const id = randomUUID();
      await m.query(
        `INSERT INTO ${this.t("tickets")}(id,customer_id,order_id,subject,body) VALUES($1,$2,$3,$4,$5)`,
        [id, a.id, d.orderId ?? null, d.subject.trim(), d.body],
      );
      await enqueueOutbox(
        m,
        {
          id: randomUUID(),
          businessKey: `ticket:${id}:classify:1`,
          type: "ticket.classify",
          aggregateId: id,
          payload: { ticketId: id, classificationVersion: 1 },
        },
        this.schema,
      );
      return this.ticket(id, m);
    });
  }
  async list(
    a: Actor,
    q: {
      page?: number;
      pageSize?: number;
      status?: string;
      category?: string;
      assignedTo?: string;
    } = {},
  ) {
    const page = q.page ?? 1,
      pageSize = q.pageSize ?? 20;
    if (page < 1 || pageSize < 1 || pageSize > 100)
      throw new TicketError("BAD_REQUEST");
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
    } else if (a.role !== "ADMIN") throw new TicketError("FORBIDDEN");
    if (q.status) add("status=", q.status);
    if (q.category) add("category=", q.category);
    if (q.assignedTo) add("assigned_to=", q.assignedTo);
    const where = filters.length ? "WHERE " + filters.join(" AND ") : "";
    const [count] = await this.source.query(
      `SELECT count(*)::int total FROM ${this.t("tickets")} ${where}`,
      args,
    );
    args.push(pageSize, (page - 1) * pageSize);
    const items = await this.source.query(
      `SELECT id,subject,status,category,assigned_to AS "assignedTo",classification_status AS "classificationStatus",needs_review AS "needsReview",version,created_at AS "createdAt" FROM ${this.t("tickets")} ${where} ORDER BY created_at DESC,id LIMIT $${args.length - 1} OFFSET $${args.length}`,
      args,
    );
    return { items, page, pageSize, total: count.total };
  }
  async detail(
    a: Actor,
    id: string,
    q: { page?: number; pageSize?: number } = {},
  ) {
    const t = await this.ticket(id);
    this.authorize(t, a);
    const page = q.page ?? 1,
      pageSize = q.pageSize ?? 20;
    if (page < 1 || pageSize < 1 || pageSize > 100)
      throw new TicketError("BAD_REQUEST");
    const messages = await this.source.query(
      `SELECT id,author_id AS "authorId",body,approved_ai_message_id AS "approvedAiMessageId",created_at AS "createdAt" FROM ${this.t("ticket_messages")} WHERE ticket_id=$1 ORDER BY created_at,id LIMIT $2 OFFSET $3`,
      [id, pageSize, (page - 1) * pageSize],
    );
    const [r] = await this.source.query(
      `SELECT count(*)::int total FROM ${this.t("ticket_messages")} WHERE ticket_id=$1`,
      [id],
    );
    return {
      ...t,
      messages: { items: messages, page, pageSize, total: r.total },
    };
  }
  async claim(a: Actor, id: string, v: number, agentId?: string) {
    if (
      !["ADMIN", "SUPPORT"].includes(a.role) ||
      (agentId && a.role !== "ADMIN")
    )
      throw new TicketError("FORBIDDEN");
    return this.source.transaction(async (m) => {
      const t = await this.ticket(id, m, true);
      this.version(t, v);
      if (a.role !== "ADMIN" && t.assignedTo && t.assignedTo !== a.id)
        throw new TicketError("ALREADY_CLAIMED");
      const agent = agentId ?? a.id;
      const [user] = await m.query(
        `SELECT id FROM ${this.t("users")} WHERE id=$1 AND role IN ('SUPPORT','ADMIN') AND status='ACTIVE'`,
        [agent],
      );
      if (!user) throw new TicketError("BAD_REQUEST");
      await m.query(
        `UPDATE ${this.t("tickets")} SET assigned_to=$2,version=version+1,updated_at=now() WHERE id=$1`,
        [id, agent],
      );
      const result = await this.ticket(id, m);
      await this.audit(m, t, a, "CLAIM", result);
      return result;
    });
  }
  async update(
    a: Actor,
    id: string,
    d: { expectedVersion: number; status?: string; category?: string },
    reopen = false,
  ) {
    return this.source.transaction(async (m) => {
      const t = await this.ticket(id, m, true);
      this.authorize(t, a, !reopen);
      this.version(t, d.expectedVersion);
      if (reopen) {
        if (
          a.role !== "CUSTOMER" ||
          t.status !== "RESOLVED" ||
          !t.resolvedAt ||
          Date.now() - new Date(t.resolvedAt).getTime() > 7 * 86400000
        )
          throw new TicketError("INVALID_TRANSITION");
        d = { ...d, status: "OPEN" };
      } else {
        if (a.role === "CUSTOMER") throw new TicketError("FORBIDDEN");
        const next: Record<string, string> = {
          OPEN: "IN_PROGRESS",
          IN_PROGRESS: "RESOLVED",
          RESOLVED: "CLOSED",
        };
        if (d.status && next[t.status] !== d.status)
          throw new TicketError("INVALID_TRANSITION");
      }
      if (
        d.category &&
        !categories.includes(d.category as (typeof categories)[number])
      )
        throw new TicketError("BAD_REQUEST");
      await m.query(
        `UPDATE ${this.t("tickets")} SET status=COALESCE($2,status),category=COALESCE($3,category),classification_source=CASE WHEN $3::text IS NULL THEN classification_source ELSE 'HUMAN' END,classification_status=CASE WHEN $3::text IS NULL THEN classification_status ELSE 'COMPLETED' END,needs_review=CASE WHEN $3::text IS NULL THEN needs_review ELSE false END,resolved_at=CASE WHEN $2='RESOLVED' THEN now() WHEN $2='OPEN' THEN NULL ELSE resolved_at END,version=version+1,updated_at=now() WHERE id=$1`,
        [id, d.status ?? null, d.category ?? null],
      );
      const result = await this.ticket(id, m);
      await this.audit(m, t, a, reopen ? "REOPEN" : "UPDATE", result);
      return result;
    });
  }
  async message(
    a: Actor,
    id: string,
    body: string,
    approvedAiMessageId?: string,
  ) {
    if (!body.trim() || body.length > 4000)
      throw new TicketError("BAD_REQUEST");
    return this.source.transaction(async (m) => {
      const t = await this.ticket(id, m, true);
      this.authorize(t, a, a.role !== "CUSTOMER");
      if (t.status === "CLOSED") throw new TicketError("TICKET_CLOSED");
      if (approvedAiMessageId) {
        if (a.role === "CUSTOMER") throw new TicketError("FORBIDDEN");
        const [turn] = await m.query(
          `SELECT x.response FROM ${this.t("ai_turns")} x JOIN ${this.t("ai_sessions")} s ON s.id=x.session_id WHERE x.id=$1 AND s.ticket_id=$2 AND s.actor_id=$3 AND x.status='COMPLETED'`,
          [approvedAiMessageId, id, a.id],
        );
        if (
          !turn ||
          turn.response?.status !== "OK" ||
          turn.response.answer !== body
        )
          throw new TicketError("AI_MESSAGE_NOT_APPROVABLE");
      }
      const [r] = await m.query(
        `INSERT INTO ${this.t("ticket_messages")}(id,ticket_id,author_id,body,approved_ai_message_id) VALUES($1,$2,$3,$4,$5) RETURNING id,body,created_at AS "createdAt"`,
        [randomUUID(), id, a.id, body, approvedAiMessageId ?? null],
      );
      await this.audit(m, t, a, "MESSAGE_SENT", {
        messageId: r.id,
        approvedAiMessageId,
      });
      return r;
    });
  }
  async order(
    a: Actor,
    id: string,
    code?: string,
    m: EntityManager = this.source.manager,
  ) {
    const t = await this.ticket(id, m);
    this.authorize(t, a, true);
    const [o] = await m.query(
      `SELECT id,code AS "orderCode",status,payment_status AS "paymentStatus",updated_at AS "updatedAt",version FROM ${this.t("orders")} WHERE customer_id=$1 AND ${code ? "code=$2" : "id=$2"} ${t.orderId ? "AND id=$3" : ""}`,
      [t.customerId, code ?? t.orderId, ...(t.orderId ? [t.orderId] : [])],
    );
    if (!o) throw new TicketError("ORDER_NOT_ACCESSIBLE");
    return o;
  }
}
