import { randomUUID } from "node:crypto";
import { DataSource, EntityManager } from "typeorm";

export interface OutboxEvent {
  id: string;
  businessKey: string;
  type: string;
  aggregateId: string;
  aggregateVersion?: number;
  payload: Record<string, unknown>;
}

function table(schema: string, name: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error("Invalid schema");
  return `"${schema}".${name}`;
}

export async function enqueueOutbox(
  manager: EntityManager,
  event: OutboxEvent,
  schema = "public",
): Promise<void> {
  await manager.query(
    `INSERT INTO ${table(schema, "outbox_events")} (id,business_key,type,aggregate_id,aggregate_version,payload) VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      event.id,
      event.businessKey,
      event.type,
      event.aggregateId,
      event.aggregateVersion ?? 1,
      JSON.stringify(event.payload),
    ],
  );
}

interface OutboxRow {
  id: string;
  business_key: string;
  type: string;
  aggregate_id: string;
  aggregate_version: number;
  payload: Record<string, unknown>;
}

export async function publishOutboxBatch(
  source: DataSource,
  publish: (event: OutboxEvent) => Promise<unknown>,
  schema = "public",
): Promise<number> {
  const token = randomUUID();
  const target = table(schema, "outbox_events");
  const rows: OutboxRow[] = await source.transaction(async (manager) => {
    const result: OutboxRow[] = await manager.query(
      `SELECT * FROM ${target} WHERE published_at IS NULL AND available_at <= now() AND (lease_until IS NULL OR lease_until < now()) ORDER BY created_at,id LIMIT 20 FOR UPDATE SKIP LOCKED`,
    );
    for (const row of result)
      await manager.query(
        `UPDATE ${target} SET lease_until=now()+interval '30 seconds',lease_token=$2,attempts=attempts+1 WHERE id=$1`,
        [row.id, token],
      );
    return result;
  });
  let published = 0;
  for (const row of rows) {
    try {
      await publish({
        id: row.id,
        businessKey: row.business_key,
        type: row.type,
        aggregateId: row.aggregate_id,
        aggregateVersion: row.aggregate_version,
        payload: row.payload,
      });
      await source.query(
        `UPDATE ${target} SET published_at=now(),lease_until=NULL,lease_token=NULL WHERE id=$1 AND lease_token=$2`,
        [row.id, token],
      );
      published++;
    } catch {
      await source.query(
        `UPDATE ${target} SET lease_until=NULL,lease_token=NULL,available_at=now()+interval '5 seconds' WHERE id=$1 AND lease_token=$2`,
        [row.id, token],
      );
    }
  }
  return published;
}

export async function deliverFakeEvent(
  source: DataSource,
  event: OutboxEvent,
  schema = "public",
): Promise<void> {
  const channel = event.type.split(".")[1];
  if (!["email", "storage", "partner"].includes(channel ?? ""))
    throw new Error("Unsupported foundation event");
  await source.transaction(async (manager) => {
    await manager.query(
      `INSERT INTO ${table(schema, "fake_deliveries")} (business_key,channel) VALUES ($1,$2) ON CONFLICT (business_key) DO NOTHING`,
      [event.businessKey, channel],
    );
    await manager.query(
      `INSERT INTO ${table(schema, "job_executions")} (business_key,type,status,result_ref) VALUES ($1,$2,'SUCCEEDED',$1) ON CONFLICT (business_key) DO UPDATE SET status='SUCCEEDED',updated_at=now()`,
      [event.businessKey, event.type],
    );
  });
}
