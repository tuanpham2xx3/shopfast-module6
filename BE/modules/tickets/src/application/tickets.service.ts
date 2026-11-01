import { randomUUID } from "node:crypto";
import { DataSource, EntityManager } from "typeorm";
import { enqueueOutbox } from "../../../../platform/src/outbox/outbox";
import { TicketsRepository } from "../persistence/tickets.repository";
import { Actor, categories, Ticket, TicketError } from "../tickets.contracts";
export class TicketsService {
  private readonly repository: TicketsRepository;
  constructor(
    public readonly source: DataSource,
    public readonly schema = "public",
  ) {
    this.repository = new TicketsRepository(this.schema);
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw Error("Invalid schema");
  }

  async ticket(
    id: string,
    m: EntityManager = this.source.manager,
    lock = false,
  ): Promise<Ticket> {
    const [r] = await this.repository.ticketTicketsSelect(m, [id], lock);
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
    await this.repository.auditTicketAuditInsert(m, [
      randomUUID(),
      t.id,
      a?.id ?? null,
      action,
      JSON.stringify(t),
      JSON.stringify(after),
    ]);
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
        const [o] = await this.repository.createOrdersSelect(m, [
          d.orderId,
          a.id,
        ]);
        if (!o) throw new TicketError("ORDER_NOT_ACCESSIBLE");
      }
      const id = randomUUID();
      await this.repository.createTicketsInsert(m, [
        id,
        a.id,
        d.orderId ?? null,
        d.subject.trim(),
        d.body,
      ]);
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
    if (!["CUSTOMER", "SUPPORT", "ADMIN"].includes(a.role))
      throw new TicketError("FORBIDDEN");
    return this.repository.list(this.source, a, q, page, pageSize);
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
    const messages = await this.repository.detailTicketMessagesSelect(
      this.source,
      [id, pageSize, (page - 1) * pageSize],
    );
    const [r] = await this.repository.detailTicketMessagesSelect2(this.source, [
      id,
    ]);
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
      const [user] = await this.repository.claimUsersSelect(m, [agent]);
      if (!user) throw new TicketError("BAD_REQUEST");
      await this.repository.claimTicketsUpdate(m, [id, agent]);
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
      await this.repository.updateTicketsUpdate(m, [
        id,
        d.status ?? null,
        d.category ?? null,
      ]);
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
        const [turn] = await this.repository.messageAiTurnsSelect(m, [
          approvedAiMessageId,
          id,
          a.id,
        ]);
        if (
          !turn ||
          turn.response?.status !== "OK" ||
          turn.response.answer !== body
        )
          throw new TicketError("AI_MESSAGE_NOT_APPROVABLE");
      }
      const [r] = await this.repository.messageTicketMessagesInsert(m, [
        randomUUID(),
        id,
        a.id,
        body,
        approvedAiMessageId ?? null,
      ]);
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
    const [o] = await this.repository.orderOrdersSelect(
      m,
      [t.customerId, code ?? t.orderId, ...(t.orderId ? [t.orderId] : [])],
      Boolean(code),
      Boolean(t.orderId),
    );
    if (!o) throw new TicketError("ORDER_NOT_ACCESSIBLE");
    return o;
  }
}
