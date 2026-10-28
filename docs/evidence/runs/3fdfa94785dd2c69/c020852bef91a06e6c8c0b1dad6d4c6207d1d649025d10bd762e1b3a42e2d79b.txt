import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import { createDataSource } from "../../libs/platform/src/database/data-source";
import {
  deliverFakeEvent,
  enqueueOutbox,
  publishOutboxBatch,
} from "../../libs/platform/src/outbox/outbox";

describe("outbox delivery contract", () => {
  let source: DataSource;
  const schema = `test_${randomUUID().replace(/-/g, "")}`;
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL)
      throw new Error("TEST_DATABASE_URL is required");
    source = await createDataSource(
      process.env.TEST_DATABASE_URL,
      schema,
    ).initialize();
    await source.query(`CREATE SCHEMA "${schema}"`);
    await source.runMigrations();
  });
  afterAll(async () => {
    if (source?.isInitialized) {
      await source.query(`DROP SCHEMA "${schema}" CASCADE`);
      await source.destroy();
    }
  });

  it("publishes committed events and applies a duplicate delivery once", async () => {
    const event = {
      id: randomUUID(),
      businessKey: randomUUID(),
      type: "foundation.email",
      aggregateId: randomUUID(),
      payload: {},
    };
    await source.transaction((manager) =>
      enqueueOutbox(manager, event, schema),
    );
    const delivered: string[] = [];
    expect(
      await publishOutboxBatch(
        source,
        async (entry) => {
          delivered.push(entry.id);
          await deliverFakeEvent(source, entry, schema);
          await deliverFakeEvent(source, entry, schema);
        },
        schema,
      ),
    ).toBe(1);
    expect(delivered).toEqual([event.id]);
    const result = await source.query(
      `SELECT * FROM "${schema}".fake_deliveries WHERE business_key=$1`,
      [event.businessKey],
    );
    expect(result).toHaveLength(1);
    expect(
      await publishOutboxBatch(source, async () => undefined, schema),
    ).toBe(0);
  });

  it("does not publish an event rolled back with the business transaction", async () => {
    const id = randomUUID();
    await expect(
      source.transaction(async (manager) => {
        await enqueueOutbox(
          manager,
          {
            id,
            businessKey: id,
            type: "foundation.email",
            aggregateId: id,
            payload: {},
          },
          schema,
        );
        throw new Error("business rollback");
      }),
    ).rejects.toThrow("business rollback");
    expect(
      await source.query(
        `SELECT id FROM "${schema}".outbox_events WHERE id=$1`,
        [id],
      ),
    ).toHaveLength(0);
  });

  it("releases a failed publish for retry without marking it published", async () => {
    const id = randomUUID();
    await source.transaction((manager) =>
      enqueueOutbox(
        manager,
        {
          id,
          businessKey: id,
          type: "foundation.email",
          aggregateId: id,
          payload: {},
        },
        schema,
      ),
    );
    await publishOutboxBatch(
      source,
      async () => {
        throw new Error("queue down");
      },
      schema,
    );
    const [row] = await source.query(
      `SELECT published_at,lease_until,attempts FROM "${schema}".outbox_events WHERE id=$1`,
      [id],
    );
    expect(row).toMatchObject({
      published_at: null,
      lease_until: null,
      attempts: 1,
    });
  });
});
