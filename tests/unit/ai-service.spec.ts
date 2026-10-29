import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import { AiService } from "../../libs/modules/ai/src/application/ai.service";
import { Part } from "../../libs/modules/ai/src/adapters/gemini.provider";
import {
  Actor,
  Ticket,
} from "../../libs/modules/tickets/src/tickets.contracts";
import { TicketsService } from "../../libs/modules/tickets/src/application/tickets.service";
const actor: Actor = { id: randomUUID(), role: "SUPPORT" };
function fixture(parts: Part[][]) {
  const session = {
    id: randomUUID(),
    ticketId: randomUUID(),
    actorId: actor.id,
    expiresAt: new Date(Date.now() + 60000),
  };
  const ticket: Ticket = {
    id: session.ticketId,
    customerId: randomUUID(),
    orderId: null,
    subject: "Order support",
    body: "Untrusted ticket text",
    status: "OPEN",
    assignedTo: actor.id,
    category: "OTHER",
    version: 1,
    resolvedAt: null,
    classificationSource: "AI",
    classificationVersion: 1,
  };
  let turn:
    | {
        id: string;
        client: string;
        message: string;
        status: string;
        response: unknown;
      }
    | undefined;
  let proposal: Record<string, unknown> | undefined;
  const query = jest.fn(async (sql: string, args: unknown[] = []) => {
    if (sql.includes('FROM "public".ai_sessions')) return [session];
    if (sql.includes('INSERT INTO "public".ai_sessions'))
      return [{ sessionId: session.id, expiresAt: session.expiresAt }];
    if (sql.includes('FROM "public".tickets')) return [ticket];
    if (sql.includes('FROM "public".orders'))
      return args[1] === "OWN"
        ? [
            {
              orderCode: "OWN",
              status: "CONFIRMED",
              paymentStatus: "PAID",
              version: 1,
              updatedAt: new Date().toISOString(),
            },
          ]
        : [];
    if (sql.includes('FROM "public".products'))
      return args[0] === "SKU"
        ? [
            {
              sku: "SKU",
              productName: "Synthetic",
              available: 7,
              active: true,
              inventoryVersion: 2,
            },
          ]
        : [];
    if (sql.includes('INSERT INTO "public".ai_turns')) {
      turn = {
        id: String(args[0]),
        client: String(args[2]),
        message: String(args[3]),
        status: "PROCESSING",
        response: null,
      };
      return [];
    }
    if (sql.includes('UPDATE "public".ai_turns')) {
      turn!.response = JSON.parse(String(args[1]));
      turn!.status = "COMPLETED";
      return [];
    }
    if (sql.includes('FROM "public".ai_turns')) {
      if (sql.startsWith("SELECT response"))
        return turn ? [{ response: turn.response }] : [];
      if (sql.includes("client_message_id"))
        return turn && turn.client === args[1] ? [turn] : [];
      return [];
    }
    if (sql.includes('INSERT INTO "public".ai_proposals')) {
      proposal = {
        id: args[0],
        session_id: session.id,
        ticket_id: ticket.id,
        actor_id: actor.id,
        payload: JSON.parse(String(args[4])),
        expected_version: ticket.version,
        expectedVersion: ticket.version,
        expires_at: new Date(Date.now() + 60000),
        status: "PENDING",
      };
      return [proposal];
    }
    if (sql.includes('FROM "public".ai_proposals'))
      return proposal ? [proposal] : [];
    if (sql.includes('UPDATE "public".ai_proposals')) {
      proposal!.status = sql.includes("'EXECUTED'") ? "EXECUTED" : "REJECTED";
      if (args[1]) proposal!.result = JSON.parse(String(args[1]));
      return [];
    }
    if (
      sql.includes('UPDATE "public".tickets') &&
      sql.includes("classification_source='HUMAN'")
    ) {
      ticket.category = String(args[1]);
      ticket.classificationSource = "HUMAN";
      ticket.version++;
    }
    return [];
  });
  const source = {
    query,
    manager: { query },
    transaction: async (fn: (m: { query: typeof query }) => Promise<unknown>) =>
      fn({ query }),
  } as unknown as DataSource;
  const provider = {
    generate: jest.fn(async () => parts.shift() ?? [{ text: "invalid" }]),
  };
  const ai = new AiService(new TicketsService(source), provider);
  return {
    ai,
    query,
    provider,
    session,
    ticket,
    get proposal() {
      return proposal;
    },
  };
}
const answer = (claims: unknown[] = [], status = "OK") => [
  {
    text: JSON.stringify({
      answer: "Untrusted prose claiming 999 units",
      status,
      claims,
    }),
  },
];
describe("AI policy, grounding and human approval decisions", () => {
  it("renders current tool facts instead of trusting model prose and replays a stored turn", async () => {
    const f = fixture([
      [
        {
          functionCall: {
            name: "get_order_status",
            args: { orderCode: "OWN" },
          },
        },
        { functionCall: { name: "check_inventory", args: { sku: "SKU" } } },
      ],
      answer([
        { tool: "get_order_status", resourceId: "OWN" },
        { tool: "check_inventory", resourceId: "SKU" },
      ]),
    ]);
    const key = randomUUID(),
      r = await f.ai.message(
        actor,
        f.session.id,
        "Look up order and inventory",
        key,
      );
    expect(r.status).toBe("OK");
    expect(r.evidence).toHaveLength(2);
    expect(r.answer).toContain("khả dụng 7");
    expect(r.answer).not.toContain("999");
    expect(
      await f.ai.message(
        actor,
        f.session.id,
        "Look up order and inventory",
        key,
      ),
    ).toEqual(r);
    expect(f.provider.generate).toHaveBeenCalledTimes(2);
    await expect(
      f.ai.message(actor, f.session.id, "changed", key),
    ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  });
  it("refuses unsupported scope and falls back for malformed or ungrounded output", async () => {
    let f = fixture([answer([], "OUT_OF_SCOPE")]);
    expect(
      (
        await f.ai.message(
          actor,
          f.session.id,
          "Outside ShopFast",
          randomUUID(),
        )
      ).status,
    ).toBe("OUT_OF_SCOPE");
    for (const response of [
      [{ text: "invalid" }],
      answer(),
      answer([{ tool: "get_order_status", resourceId: "UNKNOWN" }]),
    ]) {
      f = fixture([response]);
      expect(
        (await f.ai.message(actor, f.session.id, "untrusted", randomUUID()))
          .status,
      ).toBe("UNAVAILABLE");
    }
  });
  it("creates a proposal without changing the ticket, confirms once and rejects wrong actor/version/expiry", async () => {
    const f = fixture([
      [
        {
          functionCall: {
            name: "propose_ticket_category",
            args: { category: "PAYMENT", reason: "Payment question" },
          },
        },
      ],
      answer(),
    ]);
    const r = await f.ai.message(
      actor,
      f.session.id,
      "Propose category",
      randomUUID(),
    );
    const proposal = r.proposal as { id: string; expectedVersion: number };
    expect(f.ticket.category).toBe("OTHER");
    expect(proposal.id).toBeDefined();
    await expect(
      f.ai.decide({ ...actor, id: randomUUID() }, proposal.id, true, 1),
    ).rejects.toThrow("FORBIDDEN");
    await expect(f.ai.decide(actor, proposal.id, true, 9)).rejects.toThrow(
      "VERSION_CONFLICT",
    );
    const done = await f.ai.decide(actor, proposal.id, true, 1);
    expect(done).toMatchObject({
      category: "PAYMENT",
      classificationSource: "HUMAN",
      version: 2,
    });
    expect(await f.ai.decide(actor, proposal.id, true, 1)).toEqual(done);
    await expect(f.ai.decide(actor, proposal.id, false)).rejects.toThrow(
      "PROPOSAL_ALREADY_EXECUTED",
    );
    await f.ai.classify(f.ticket.id);
    expect(f.provider.generate).toHaveBeenCalledTimes(2);
  });
  it("rejects expired sessions, foreign actors and malformed turns before model calls", async () => {
    const f = fixture([]);
    await f.ai.createSession(actor, f.ticket.id);
    await expect(
      f.ai.message(actor, f.session.id, " ", randomUUID()),
    ).rejects.toThrow("BAD_REQUEST");
    await expect(
      f.ai.message(
        { ...actor, id: randomUUID() },
        f.session.id,
        "hello",
        randomUUID(),
      ),
    ).rejects.toThrow("SESSION_NOT_ACCESSIBLE");
    f.session.expiresAt = new Date(0);
    await expect(f.ai.session(actor, f.session.id)).rejects.toThrow(
      "SESSION_NOT_ACCESSIBLE",
    );
    expect(f.provider.generate).not.toHaveBeenCalled();
  });
  it("bounds tool rounds and blocks tools not allowlisted", async () => {
    const f = fixture(
      Array.from({ length: 5 }, () => [
        {
          functionCall: {
            name: "arbitrary_sql",
            args: { sql: "DROP TABLE users" },
          },
        },
      ]),
    );
    expect(
      (await f.ai.message(actor, f.session.id, "run this tool", randomUUID()))
        .status,
    ).toBe("UNAVAILABLE");
    expect(f.provider.generate).toHaveBeenCalledTimes(5);
  });
  it("classifies valid schema and bounds failed schema retries", async () => {
    const f = fixture([
      [
        {
          text: JSON.stringify({
            category: "PAYMENT",
            confidence: 0.9,
            reason: "Payment",
          }),
        },
      ],
    ]);
    await f.ai.classify(f.ticket.id);
    expect(f.provider.generate).toHaveBeenCalledTimes(1);
    const failed = fixture([[{ text: "invalid" }], [{ text: "invalid" }]]);
    await failed.ai.classify(failed.ticket.id);
    expect(failed.provider.generate).toHaveBeenCalledTimes(2);
    expect(
      failed.query.mock.calls.some(([, args]) => args?.includes("FAILED")),
    ).toBe(true);
  });
});
