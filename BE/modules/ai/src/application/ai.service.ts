import { randomUUID } from "node:crypto";
import { EntityManager } from "typeorm";
import { z } from "zod";
import {
  Actor,
  categories,
  TicketError,
} from "../../../tickets/src/tickets.contracts";
import { TicketsService } from "../../../tickets/src/application/tickets.service";
import {
  BoundedProvider,
  classificationSchema,
  Content,
  GeminiProvider,
  Part,
} from "../adapters/gemini.provider";
import { AiRepository } from "../persistence/ai.repository";
const unavailable =
  "Trợ lý AI đang tạm thời không khả dụng. Bạn có thể tra cứu bằng công cụ thông thường.";
const answerSchema = z
  .object({
    answer: z.string().min(1).max(4000),
    status: z.enum(["OK", "OUT_OF_SCOPE"]),
    claims: z
      .array(
        z
          .object({
            tool: z.enum(["get_order_status", "check_inventory"]),
            resourceId: z.string(),
          })
          .strict(),
      )
      .max(6),
  })
  .strict();
interface Evidence {
  tool: string;
  resourceId: string;
  observedAt: string;
  resultSummary: Record<string, unknown>;
}
interface Session {
  id: string;
  ticketId: string;
  actorId: string;
  expiresAt: Date;
}
export class AiService {
  private readonly repository: AiRepository;
  readonly provider: BoundedProvider;
  constructor(
    readonly tickets: TicketsService,
    provider: GeminiProvider = {
      generate: async () => {
        throw new Error("GEMINI_PROVIDER_NOT_CONFIGURED");
      },
    },
    private readonly deadlineMs = 25000,
  ) {
    this.repository = new AiRepository(this.tickets.schema);
    this.provider = new BoundedProvider(provider);
  }
  async session(
    a: Actor,
    id: string,
    m: EntityManager = this.tickets.source.manager,
  ): Promise<Session> {
    const [s] = await this.repository.sessionAiSessionsSelect(m, [id]);
    if (!s) throw new TicketError("NOT_FOUND");
    if (s.actorId !== a.id || new Date(s.expiresAt).getTime() <= Date.now())
      throw new TicketError("SESSION_NOT_ACCESSIBLE");
    const t = await this.tickets.ticket(s.ticketId, m);
    this.tickets.authorize(t, a, true);
    if (!["ADMIN", "SUPPORT"].includes(a.role))
      throw new TicketError("FORBIDDEN");
    return s;
  }
  async createSession(a: Actor, ticketId: string) {
    const t = await this.tickets.ticket(ticketId);
    this.tickets.authorize(t, a, true);
    if (!["ADMIN", "SUPPORT"].includes(a.role))
      throw new TicketError("FORBIDDEN");
    const [s] = await this.repository.createSessionAiSessionsInsert(
      this.tickets.source,
      [randomUUID(), ticketId, a.id],
    );
    return s;
  }
  async message(
    a: Actor,
    id: string,
    message: string,
    clientMessageId: string,
  ) {
    const deadline = Date.now() + this.deadlineMs;
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        this.executeMessage(a, id, message, clientMessageId, deadline),
        new Promise<Record<string, unknown>>((_, reject) => {
          timer = setTimeout(
            () => reject(new TicketError("AI_DEADLINE")),
            this.deadlineMs,
          );
        }),
      ]);
    } catch (error) {
      if (error instanceof TicketError && error.code === "AI_DEADLINE")
        return {
          answer: unavailable,
          status: "UNAVAILABLE",
          evidence: [],
          toolResults: [],
          proposal: null,
        };
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  private async executeMessage(
    a: Actor,
    id: string,
    message: string,
    clientMessageId: string,
    deadline: number,
  ) {
    if (
      !message.trim() ||
      message.length > 4000 ||
      !z.string().uuid().safeParse(clientMessageId).success
    )
      throw new TicketError("BAD_REQUEST");
    const session = await this.session(a, id);
    if (Date.now() >= deadline) throw new TicketError("AI_DEADLINE");
    const turn = await this.tickets.source.transaction(async (m) => {
      await this.repository.executeMessageAiSessionsSelect(m, [id]);
      if (Date.now() >= deadline) throw new TicketError("AI_DEADLINE");
      const [old] = await this.repository.executeMessageAiTurnsSelect(m, [
        id,
        clientMessageId,
      ]);
      if (old) {
        if (old.message !== message)
          throw new TicketError("IDEMPOTENCY_CONFLICT");
        if (old.status === "PROCESSING") {
          if (Date.now() - new Date(old.created_at).getTime() < 30000)
            throw new TicketError("REQUEST_IN_PROGRESS");
          const response = {
            aiMessageId: old.id,
            answer: unavailable,
            status: "UNAVAILABLE",
            evidence: [],
            toolResults: [],
            proposal: null,
          };
          await this.repository.executeMessageAiTurnsUpdate(m, [
            old.id,
            JSON.stringify(response),
          ]);
          return { id: old.id, response };
        }
        return { id: old.id, response: old.response };
      }
      const [busy] = await this.repository.executeMessageAiTurnsSelect2(m, [
        id,
      ]);
      if (busy) throw new TicketError("REQUEST_IN_PROGRESS");
      const turnId = randomUUID();
      await this.repository.executeMessageAiTurnsInsert(m, [
        turnId,
        id,
        clientMessageId,
        message,
      ]);
      return { id: turnId, response: null };
    });
    if (turn.response) return turn.response;
    let response: Record<string, unknown>;
    try {
      response = await this.run(a, session, message, deadline);
    } catch {
      response = {
        answer: unavailable,
        status: "UNAVAILABLE",
        evidence: [],
        toolResults: [],
        proposal: null,
      };
    }
    await this.session(a, id);
    if (Date.now() >= deadline) throw new TicketError("AI_DEADLINE");
    response = { ...response, aiMessageId: turn.id };
    await this.repository.executeMessageAiTurnsUpdate2(this.tickets.source, [
      turn.id,
      JSON.stringify(response),
    ]);
    const [stored] = await this.repository.executeMessageAiTurnsSelect3(
      this.tickets.source,
      [turn.id],
    );
    if (stored?.response) return stored.response;
    return JSON.parse(JSON.stringify(response)) as Record<string, unknown>;
  }
  private async run(
    a: Actor,
    s: Session,
    message: string,
    deadline: number,
  ): Promise<Record<string, unknown>> {
    const t = await this.tickets.ticket(s.ticketId);
    const history = await this.repository.runAiTurnsSelect(
      this.tickets.source,
      [s.id],
    );
    const contents: Content[] = [
      {
        role: "user",
        parts: [
          {
            text: JSON.stringify({
              ticket: { subject: t.subject, body: t.body },
              message,
            }),
          },
        ],
      },
    ];
    for (const h of history) {
      contents.unshift(
        { role: "user", parts: [{ text: h.message }] },
        { role: "model", parts: [{ text: JSON.stringify(h.response) }] },
      );
    }
    if (JSON.stringify(contents).length > 20000)
      throw new TicketError("CONTEXT_LIMIT");
    const evidence: Evidence[] = [];
    let proposal: unknown = null,
      calls = 0;
    for (let round = 0; round <= 4; round++) {
      await this.session(a, s.id);
      if (Date.now() >= deadline) throw new TicketError("AI_DEADLINE");
      while (contents.length > 12) contents.splice(0, 2);
      if (JSON.stringify(contents).length > 20000)
        throw new TicketError("CONTEXT_LIMIT");
      const parts = await this.provider.generate(contents, deadline);
      const functions = parts.filter((p) => p.functionCall);
      if (!functions.length) {
        const raw = parts
          .map((p) => p.text ?? "")
          .join("")
          .replace(/^```(?:json)?\s*|\s*```$/g, "");
        let parsed: z.infer<typeof answerSchema>;
        try {
          parsed = answerSchema.parse(JSON.parse(raw));
        } catch {
          throw new TicketError("UNGROUNDED_OUTPUT");
        }
        if (
          parsed.status === "OK" &&
          ((!parsed.claims.length && !proposal) ||
            parsed.claims.some(
              (c) =>
                !evidence.some(
                  (e) => e.tool === c.tool && e.resourceId === c.resourceId,
                ),
            ))
        )
          throw new TicketError("UNGROUNDED_OUTPUT");
        return {
          // Render facts from validated current-turn DB evidence. Provider prose
          // is deliberately not trusted as a proof of its own grounding.
          answer:
            parsed.status === "OUT_OF_SCOPE"
              ? "Trợ lý chỉ hỗ trợ nghiệp vụ ShopFast."
              : evidence.length
                ? evidence
                    .map((e) =>
                      e.tool === "get_order_status"
                        ? `Đơn ${e.resourceId}: ${e.resultSummary.status}; thanh toán ${e.resultSummary.paymentStatus}; phiên bản ${e.resultSummary.version}.`
                        : `SKU ${e.resourceId}: khả dụng ${e.resultSummary.available}; đang bán ${e.resultSummary.active}; phiên bản tồn ${e.resultSummary.inventoryVersion}. Tồn tại thời điểm tra cứu không phải giữ hàng.`,
                    )
                    .join("\n")
                : "Đề xuất phân loại đã được tạo. Hãy kiểm tra và xác nhận bằng nút xác nhận.",
          status: parsed.status,
          evidence,
          toolResults: evidence,
          proposal,
        };
      }
      if (round === 4 || calls + functions.length > 6)
        throw new TicketError("TOOL_LIMIT");
      contents.push({ role: "model", parts });
      const responses: Part[] = [];
      for (const p of functions) {
        if (Date.now() >= deadline) throw new TicketError("AI_DEADLINE");
        calls++;
        const call = p.functionCall!;
        let result: unknown;
        try {
          result = await this.tool(
            a,
            s,
            call.name,
            call.args,
            evidence,
            deadline,
          );
          if (call.name === "propose_ticket_category") proposal = result;
        } catch (e) {
          result = {
            error: e instanceof TicketError ? e.code : "TOOL_UNAVAILABLE",
          };
        }
        responses.push({
          functionResponse: {
            ...(call.id ? { id: call.id } : {}),
            name: call.name,
            response: result,
          },
        });
      }
      contents.push({ role: "user", parts: responses });
    }
    throw new TicketError("TOOL_LIMIT");
  }
  private async tool(
    a: Actor,
    s: Session,
    name: string,
    args: unknown,
    evidence: Evidence[],
    deadline = Date.now() + 2000,
  ) {
    return this.tickets.source.transaction(async (m) => {
      await this.repository.toolLockSet(m, []);
      await this.session(a, s.id, m);
      if (Date.now() >= deadline) throw new TicketError("AI_DEADLINE");
      if (name === "get_order_status") {
        const d = z
          .object({ orderCode: z.string().min(1).max(40) })
          .strict()
          .parse(args);
        const result = await this.tickets.order(a, s.ticketId, d.orderCode, m);
        const safe = {
          orderCode: result.orderCode,
          status: result.status,
          paymentStatus: result.paymentStatus,
          updatedAt: result.updatedAt,
          version: result.version,
        };
        evidence.push({
          tool: name,
          resourceId: result.orderCode,
          observedAt: new Date().toISOString(),
          resultSummary: safe,
        });
        return safe;
      }
      if (name === "check_inventory") {
        const d = z
          .object({ sku: z.string().min(1).max(64) })
          .strict()
          .parse(args);
        const [r] = await this.repository.toolProductsSelect(m, [d.sku]);
        if (!r) throw new TicketError("PRODUCT_NOT_FOUND");
        evidence.push({
          tool: name,
          resourceId: r.sku,
          observedAt: new Date().toISOString(),
          resultSummary: r,
        });
        return r;
      }
      if (name === "propose_ticket_category") {
        const d = z
          .object({
            category: z.enum(categories),
            reason: z.string().min(1).max(300),
          })
          .strict()
          .parse(args);
        const t = await this.tickets.ticket(s.ticketId, m, true);
        this.tickets.authorize(t, a, true);
        if (Date.now() >= deadline) throw new TicketError("AI_DEADLINE");
        const [p] = await this.repository.toolAiProposalsInsert(m, [
          randomUUID(),
          s.id,
          t.id,
          a.id,
          JSON.stringify({ ...d, previousCategory: t.category }),
          t.version,
        ]);
        return p;
      }
      throw new TicketError("TOOL_NOT_ALLOWED");
    });
  }
  async decide(
    a: Actor,
    id: string,
    confirm: boolean,
    expectedVersion?: number,
  ) {
    return this.tickets.source.transaction(async (m) => {
      const [p] = await this.repository.decideAiProposalsSelect(m, [id]);
      if (!p) throw new TicketError("NOT_FOUND");
      if (a.id !== p.actor_id && a.role !== "ADMIN")
        throw new TicketError("FORBIDDEN");
      const t = await this.tickets.ticket(p.ticket_id, m, true);
      this.tickets.authorize(t, a, true);
      if (a.role !== "ADMIN" && a.role !== "SUPPORT")
        throw new TicketError("FORBIDDEN");
      if (p.status === "EXECUTED") {
        if (!confirm) throw new TicketError("PROPOSAL_ALREADY_EXECUTED");
        return p.result;
      }
      if (p.status === "REJECTED") {
        if (confirm) throw new TicketError("PROPOSAL_REJECTED");
        return { id, status: "REJECTED" };
      }
      if (new Date(p.expires_at).getTime() <= Date.now())
        throw new TicketError("PROPOSAL_EXPIRED");
      if (!confirm) {
        await this.repository.decideAiProposalsUpdate(m, [id]);
        await this.tickets.audit(m, t, a, "AI_PROPOSAL_REJECTED", {
          proposalId: id,
        });
        return { id, status: "REJECTED" };
      }
      if (expectedVersion !== p.expected_version)
        throw new TicketError("VERSION_CONFLICT");
      this.tickets.version(t, p.expected_version);
      await this.repository.decideTicketsUpdate(m, [t.id, p.payload.category]);
      const result = await this.tickets.ticket(t.id, m);
      await this.tickets.audit(m, t, a, "AI_PROPOSAL_CONFIRMED", {
        proposalId: id,
        ticket: result,
      });
      await this.repository.decideAiProposalsUpdate2(m, [
        id,
        JSON.stringify(result),
      ]);
      return result;
    });
  }
  async classify(ticketId: string, classificationVersion = 1) {
    const t = await this.tickets.ticket(ticketId);
    if (
      t.classificationSource === "HUMAN" ||
      t.classificationVersion !== classificationVersion
    )
      return;
    let result: z.infer<typeof classificationSchema> | undefined;
    for (let i = 0; i < 2; i++) {
      try {
        const parts = await this.provider.generate(
          [
            {
              role: "user",
              parts: [
                { text: JSON.stringify({ subject: t.subject, body: t.body }) },
              ],
            },
          ],
          Date.now() + 12000,
          true,
          1,
        );
        result = classificationSchema.parse(
          JSON.parse(parts.map((p) => p.text ?? "").join("")),
        );
        break;
      } catch {
        /* bounded schema/provider failure becomes review */
      }
    }
    await this.repository.classifyTicketsUpdate(this.tickets.source, [
      ticketId,
      classificationVersion,
      result?.category ?? "OTHER",
      result?.confidence ?? null,
      result?.reason ?? null,
      result ? "COMPLETED" : "FAILED",
      !result || result.confidence < 0.7,
    ]);
  }
}
