import { randomUUID } from "node:crypto";
import { EntityManager } from "typeorm";
import { enqueueOutbox } from "../../../platform/src/outbox/outbox";

export async function enqueueCatalogInvalidation(
  manager: EntityManager,
  schema: string,
  aggregateId: string,
  productIds: string[],
  additionalTags: string[] = [],
  aggregateVersion = 1,
): Promise<string[]> {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw Error("Invalid schema");
  const rows: { id: string; category_id: string; brand_id: string }[] =
    productIds.length
      ? await manager.query(
          `SELECT id,category_id,brand_id FROM "${schema}".products WHERE id=ANY($1::uuid[])`,
          [productIds],
        )
      : [];
  const tags = [
    ...new Set([
      "lists:unfiltered",
      ...additionalTags,
      ...productIds.map((id) => `product:${id}`),
      ...rows.flatMap((row) => [
        `category:${row.category_id}`,
        `brand:${row.brand_id}`,
      ]),
    ]),
  ];
  const id = randomUUID();
  await enqueueOutbox(
    manager,
    {
      id,
      businessKey: `catalog-invalidate:${id}`,
      type: "catalog.invalidate",
      aggregateId,
      aggregateVersion,
      payload: { tags },
    },
    schema,
  );
  return tags;
}
