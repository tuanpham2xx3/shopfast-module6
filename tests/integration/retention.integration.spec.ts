import { randomUUID } from "node:crypto";
import { createDataSource } from "../../libs/platform/src/database/data-source";
import { RetentionService } from "../../libs/modules/jobs/src/retention.service";
import { TicketsService } from "../../libs/modules/tickets/src/tickets.service";

describe("bounded retention preserves audit and replay protection", () => {
  const schema = `test_${randomUUID().replace(/-/g, "")}`;
  const source = createDataSource(process.env.TEST_DATABASE_URL!, schema);
  const now = new Date("2026-10-19T00:00:00Z");
  beforeAll(async () => {
    await source.initialize();
    await source.query(`CREATE SCHEMA "${schema}"`);
    await source.runMigrations();
  });
  afterAll(async () => {
    if (source.isInitialized) {
      await source.query(`DROP SCHEMA "${schema}" CASCADE`);
      await source.destroy();
    }
  });
  it("bounds each batch, retains unexpired replay records and skips a concurrent cleaner", async () => {
    const user = randomUUID(),
      ticket = randomUUID();
    await source.query(
      `INSERT INTO "${schema}".users(id,email,password_hash,display_name,role) VALUES($1,'batch@example.test','test','Test','SUPPORT')`,
      [user],
    );
    await source.query(
      `INSERT INTO "${schema}".tickets(id,customer_id,subject,body) VALUES($1,$2,'Batch test','Test')`,
      [ticket, user],
    );
    const sessionIds = [randomUUID(), randomUUID(), randomUUID()];
    for (const [i, id] of sessionIds.entries()) {
      await source.query(
        `INSERT INTO "${schema}".ai_sessions(id,ticket_id,actor_id,created_at,expires_at) VALUES($1,$2,$3,'2025-01-01','2025-01-02')`,
        [id, ticket, user],
      );
      await source.query(
        `INSERT INTO "${schema}".idempotency_records(user_id,route,key,request_hash,status_code,response,expires_at) VALUES($1,'checkout',$2,'hash',200,'{}','2025-01-01')`,
        [user, String(i)],
      );
    }
    await source.query(
      `INSERT INTO "${schema}".idempotency_records(user_id,route,key,request_hash,status_code,response,expires_at) VALUES($1,'checkout','active','hash',200,'{}','2026-10-20')`,
      [user],
    );
    const service = new RetentionService(source, schema, () => now);
    await service.cleanup(2);
    expect(
      await source.query(
        `SELECT id FROM "${schema}".ai_sessions WHERE id=ANY($1::uuid[])`,
        [sessionIds],
      ),
    ).toHaveLength(1);
    expect(
      await source.query(
        `SELECT key FROM "${schema}".idempotency_records WHERE user_id=$1`,
        [user],
      ),
    ).toHaveLength(2);
    await service.cleanup(2);
    expect(
      await source.query(
        `SELECT key FROM "${schema}".idempotency_records WHERE user_id=$1`,
        [user],
      ),
    ).toEqual([{ key: "active" }]);
    await source.transaction(async (m) => {
      await m.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${schema}:retention`,
      ]);
      expect(await service.cleanup()).toEqual({ skipped: 1 });
    });
    await expect(service.cleanup(0)).rejects.toThrow(
      "Invalid retention batch size",
    );
  });
  it("removes old unapproved AI content, redacts approved turns and preserves customer reply", async () => {
    const user = randomUUID(),
      ticket = randomUUID(),
      session = randomUUID();
    await source.query(
      `INSERT INTO "${schema}".users(id,email,password_hash,display_name,role) VALUES($1,'retention@example.test','test','Test','SUPPORT')`,
      [user],
    );
    await source.query(
      `INSERT INTO "${schema}".tickets(id,customer_id,subject,body) VALUES($1,$2,'Retention test','Test')`,
      [ticket, user],
    );
    await source.query(
      `INSERT INTO "${schema}".ai_sessions(id,ticket_id,actor_id,created_at,expires_at) VALUES($1,$2,$3,'2026-08-01','2026-08-02')`,
      [session, ticket, user],
    );
    const approved = randomUUID(),
      disposable = randomUUID(),
      recent = randomUUID();
    for (const [id, date] of [
      [approved, "2026-08-01"],
      [disposable, "2026-08-01"],
      [recent, "2026-10-18"],
    ])
      await source.query(
        `INSERT INTO "${schema}".ai_turns(id,session_id,client_message_id,message,response,status,created_at) VALUES($1,$2,$3,'private prompt','{"answer":"private draft"}','COMPLETED',$4)`,
        [id, session, randomUUID(), date],
      );
    await source.query(
      `INSERT INTO "${schema}".ticket_messages(id,ticket_id,author_id,body,approved_ai_message_id) VALUES($1,$2,$3,'Approved customer reply',$4)`,
      [randomUUID(), ticket, user, approved],
    );
    const service = new RetentionService(source, schema, () => now);
    await service.cleanup();
    const rows = await source.query(
      `SELECT id,message,response FROM "${schema}".ai_turns ORDER BY id`,
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((r: { id: string }) => r.id === approved)).toMatchObject({
      message: "[REDACTED_BY_RETENTION]",
      response: null,
    });
    expect(rows.find((r: { id: string }) => r.id === recent).message).toBe(
      "private prompt",
    );
    expect(
      (
        await source.query(
          `SELECT body,approved_ai_message_id FROM "${schema}".ticket_messages`,
        )
      )[0],
    ).toMatchObject({
      body: "Approved customer reply",
      approved_ai_message_id: approved,
    });
    await service.cleanup();
    expect(
      await source.query(
        `SELECT id,message,response FROM "${schema}".ai_turns ORDER BY id`,
      ),
    ).toEqual(rows);
  });
  it("keeps successful job tombstones, failed/pending payloads and active security counters", async () => {
    for (const status of ["SUCCEEDED", "FAILED", "PENDING"])
      await source.query(
        `INSERT INTO "${schema}".job_executions(business_key,type,status,payload,updated_at) VALUES($1,'email.confirmation',$1,'{"orderId":"fixture"}','2026-01-01')`,
        [status],
      );
    await source.query(
      `INSERT INTO "${schema}".security_counters(scope,subject_hash,window_start,count,blocked_until) VALUES('test','old','2026-01-01',1,null),('test','blocked','2026-01-01',1,'2026-10-20'),('test','recent','2026-10-18T23:59:00Z',1,null)`,
    );
    await new RetentionService(source, schema, () => now).cleanup();
    const jobs = await source.query(
      `SELECT business_key,payload FROM "${schema}".job_executions ORDER BY business_key`,
    );
    expect(jobs).toHaveLength(3);
    expect(
      jobs.find((j: { business_key: string }) => j.business_key === "SUCCEEDED")
        .payload,
    ).toEqual({});
    expect(
      jobs.find((j: { business_key: string }) => j.business_key === "PENDING")
        .payload,
    ).toEqual({ orderId: "fixture" });
    expect(
      jobs.find((j: { business_key: string }) => j.business_key === "FAILED")
        .payload,
    ).toEqual({ orderId: "fixture" });
    expect(
      (
        await source.query(
          `SELECT subject_hash FROM "${schema}".security_counters ORDER BY subject_hash`,
        )
      ).map((r: { subject_hash: string }) => r.subject_hash),
    ).toEqual(["blocked", "recent"]);
  });
  it("allows an already validated human approval to finish while cleanup runs", async () => {
    const user = randomUUID(),
      ticket = randomUUID(),
      session = randomUUID(),
      turn = randomUUID();
    await source.query(
      `INSERT INTO "${schema}".users(id,email,password_hash,display_name,role) VALUES($1,'race@example.test','test','Test','SUPPORT')`,
      [user],
    );
    await source.query(
      `INSERT INTO "${schema}".tickets(id,customer_id,assigned_to,subject,body,status) VALUES($1,$2,$2,'Approval race','Test','IN_PROGRESS')`,
      [ticket, user],
    );
    await source.query(
      `INSERT INTO "${schema}".ai_sessions(id,ticket_id,actor_id) VALUES($1,$2,$3)`,
      [session, ticket, user],
    );
    await source.query(
      `INSERT INTO "${schema}".ai_turns(id,session_id,client_message_id,message,response,status,created_at) VALUES($1,$2,$3,'old prompt','{"status":"OK","answer":"Approved reply"}','COMPLETED','2025-01-01')`,
      [turn, session, randomUUID()],
    );
    await source.query(
      `CREATE FUNCTION "${schema}".pause_approval() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(72419001); RETURN NEW; END $$`,
    );
    await source.query(
      `CREATE TRIGGER pause_approval BEFORE INSERT ON "${schema}".ticket_messages FOR EACH ROW EXECUTE FUNCTION "${schema}".pause_approval()`,
    );
    const gate = source.createQueryRunner();
    await gate.connect();
    await gate.startTransaction();
    await gate.query("SELECT pg_advisory_xact_lock(72419001)");
    const approval = new TicketsService(source, schema).message(
      { id: user, role: "SUPPORT" },
      ticket,
      "Approved reply",
      turn,
    );
    // Observe the trigger waiting after validation, rather than relying on a race delay.
    const settled = approval.then(
      (value) => ({ value, error: null }),
      (error) => ({ value: null, error }),
    );
    try {
      let waiting = false;
      for (let i = 0; i < 100; i++) {
        const [row] = await source.query(
          "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event='advisory' AND query LIKE '%ticket_messages%') waiting",
        );
        if (row.waiting) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      await new RetentionService(source, schema, () => now).cleanup();
    } finally {
      await gate.rollbackTransaction();
      await gate.release();
    }
    const result = await settled;
    expect(result.error).toBeNull();
    expect(result.value).toMatchObject({ body: "Approved reply" });
    await new RetentionService(source, schema, () => now).cleanup();
    expect(
      (
        await source.query(
          `SELECT response FROM "${schema}".ai_turns WHERE id=$1`,
          [turn],
        )
      )[0].response,
    ).toBeNull();
  });
});
