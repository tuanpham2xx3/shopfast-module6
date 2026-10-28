import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createDataSource } from "../libs/platform/src/database/data-source";
import { TicketsService, Actor } from "../libs/modules/tickets/tickets.service";
import { AiService } from "../libs/modules/ai/ai.service";
import {
  GoogleGeminiProvider,
  GeminiProvider,
  ProviderRequest,
} from "../libs/modules/ai/gemini.provider";
import { CatalogService } from "../libs/modules/catalog/catalog.service";

async function main() {
  assert(
    process.env.TEST_DATABASE_URL &&
      process.env.GEMINI_API_KEY &&
      process.env.GEMINI_MODEL,
    "Configure TEST_DATABASE_URL and backend Gemini credentials",
  );
  const schema = `smoke_${randomUUID().replace(/-/g, "")}`;
  const source = createDataSource(process.env.TEST_DATABASE_URL, schema);
  const checks: string[] = [];
  let nextRequestAt = 0,
    requests = 0;
  const google = new GoogleGeminiProvider();
  const paced: GeminiProvider = {
    async generate(request: ProviderRequest) {
      const wait = Math.max(0, nextRequestAt - Date.now());
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      request.signal.throwIfAborted();
      nextRequestAt = Date.now() + 5000;
      requests++;
      return google.generate(request);
    },
  };
  try {
    await source.initialize();
    await source.query(`CREATE SCHEMA "${schema}"`);
    await source.runMigrations();
    const customer: Actor = { id: randomUUID(), role: "CUSTOMER" };
    const support: Actor = { id: randomUUID(), role: "SUPPORT" };
    for (const actor of [customer, support])
      await source.query(
        `INSERT INTO "${schema}".users(id,email,password_hash,display_name,role,email_verified_at) VALUES($1,$2,'test','Synthetic',$3,now())`,
        [actor.id, `${actor.id}@example.test`, actor.role],
      );
    const tickets = new TicketsService(source, schema);
    const catalog = new CatalogService(source, schema);
    const category = await catalog.createTaxonomy("categories", {
      name: "Smoke",
      slug: "smoke",
    });
    const brand = await catalog.createTaxonomy("brands", {
      name: "Smoke",
      slug: "smoke",
    });
    const product = await catalog.createProduct({
      sku: "SMOKE-SKU",
      slug: "smoke-sku",
      name: "Synthetic item",
      description: "Test fixture",
      imageUrl: "https://example.test/item.png",
      categoryId: category.id,
      brandId: brand.id,
      price: 100,
    });
    await catalog.adjust(product.id, support.id, "smoke-stock", {
      delta: 7,
      reason: "Synthetic",
      expectedVersion: 1,
    });
    await source.query(
      `INSERT INTO "${schema}".orders(id,code,customer_id,status,payment_status,subtotal,discount,total,address_snapshot,expires_at) VALUES($1,'SMOKE-ORDER',$2,'CONFIRMED','PAID',100,0,100,'{}',now()+interval '1 hour')`,
      [randomUUID(), customer.id],
    );
    let ticket = await tickets.create(customer, {
      subject: "Payment help",
      body: "Tôi cần hỗ trợ thanh toán.",
    });
    ticket = await tickets.claim(support, ticket.id, ticket.version);
    const ai = new AiService(tickets, paced);
    const session = await ai.createSession(support, ticket.id);
    const result = await ai.message(
      support,
      session.sessionId,
      "Tra cứu trạng thái đơn SMOKE-ORDER và tồn kho SKU SMOKE-SKU bằng cả hai tool. Trả JSON đúng hợp đồng với claims cho cả hai resource.",
      randomUUID(),
    );
    assert.equal(result.status, "OK");
    const evidence = result.evidence as {
      tool: string;
      resourceId: string;
      resultSummary: Record<string, unknown>;
    }[];
    assert(
      evidence.some(
        (e) =>
          e.tool === "get_order_status" &&
          e.resourceId === "SMOKE-ORDER" &&
          e.resultSummary.status === "CONFIRMED",
      ),
    );
    assert(
      evidence.some(
        (e) =>
          e.tool === "check_inventory" &&
          e.resourceId === "SMOKE-SKU" &&
          e.resultSummary.available === 7,
      ),
    );
    checks.push(
      "live model selects both tools; response grounded in PostgreSQL",
    );
    const proposalSession = await ai.createSession(support, ticket.id);
    const key = randomUUID();
    const prompt =
      "Dùng propose_ticket_category đề xuất category PAYMENT, reason: khách cần hỗ trợ thanh toán. Không tự xác nhận. Trả JSON đúng hợp đồng, claims rỗng.";
    const proposed = await ai.message(
      support,
      proposalSession.sessionId,
      prompt,
      key,
    );
    assert.equal(proposed.status, "OK");
    const proposal = proposed.proposal as {
      id: string;
      expectedVersion: number;
    };
    assert(proposal?.id);
    assert.equal((await tickets.ticket(ticket.id)).category, ticket.category);
    assert.equal((await tickets.detail(customer, ticket.id)).messages.total, 0);
    checks.push("proposal leaves category and customer messages unchanged");
    const callsBeforeReplay = requests;
    assert.deepEqual(
      await ai.message(support, proposalSession.sessionId, prompt, key),
      proposed,
    );
    assert.equal(requests, callsBeforeReplay);
    checks.push("turn replay makes no additional provider call");
    const confirmed = await ai.decide(
      support,
      proposal.id,
      true,
      proposal.expectedVersion,
    );
    assert.equal(confirmed.category, "PAYMENT");
    assert.equal(confirmed.classificationSource, "HUMAN");
    assert.deepEqual(
      await ai.decide(support, proposal.id, true, proposal.expectedVersion),
      JSON.parse(JSON.stringify(confirmed)),
    );
    checks.push("explicit human confirmation applies once and replays safely");
  } finally {
    if (source.isInitialized) {
      await source.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await source.destroy();
    }
    await writeFile(
      process.env.GEMINI_AGENT_REPORT_PATH ??
        "docs/evidence/gemini-agent-live.json",
      JSON.stringify(
        {
          executedAt: new Date().toISOString(),
          model: process.env.GEMINI_MODEL,
          intervalMs: 5000,
          requests,
          checks,
          acceptance: checks.length === 4 ? "PASS" : "FAIL",
        },
        null,
        2,
      ),
    );
  }
  console.log(
    `Gemini agent smoke: ${checks.length}/4 checks passed; ${requests} provider requests`,
  );
}
void main().catch(() => {
  console.error(
    "Gemini agent smoke failed; inspect safe evidence. Credentials were not logged.",
  );
  process.exitCode = 1;
});
