// Run inside the application container: node - [--apply] < this-file.
// Only known, incomplete synthetic harness fixtures are eligible.
const { Client } = require("pg");
const { randomUUID } = require("node:crypto");

async function main() {
  const apply = process.argv.includes("--apply");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const repaired = [],
    skipped = [];
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT t.* FROM tickets t JOIN users u ON u.id=t.customer_id
       WHERE u.display_name='Harness Demo' AND t.subject='Harness order support'
       AND t.body='Kiểm tra đơn giao thành công giúp tôi.' AND t.order_id IS NULL
       AND t.status IN ('OPEN','IN_PROGRESS') ORDER BY t.id FOR UPDATE OF t`,
    );
    for (const before of rows) {
      const orders = await client.query(
        `SELECT o.id,o.code,o.status,o.payment_status,
          (SELECT string_agg(i.sku_snapshot, ', ' ORDER BY i.sku_snapshot)
           FROM order_items i WHERE i.order_id=o.id) AS skus
         FROM orders o WHERE o.customer_id=$1`,
        [before.customer_id],
      );
      const order = orders.rows[0];
      if (
        orders.rows.length !== 1 ||
        order.status !== "DELIVERED" ||
        order.payment_status !== "PAID" ||
        !order.skus
      ) {
        skipped.push({
          ticketId: before.id,
          reason: "AMBIGUOUS_OR_INCOMPLETE_ORDER",
        });
        continue;
      }
      const subject = `Kiểm tra giao hàng đơn ${order.code}`;
      const body = `Tôi đã nhận đơn ${order.code}, sản phẩm SKU ${order.skus}. Nhờ ShopFast xác nhận lại trạng thái giao hàng và thanh toán của đơn này.`;
      if (apply) {
        const {
          rows: [after],
        } = await client.query(
          `UPDATE tickets SET order_id=$2,subject=$3,body=$4,
           status=CASE WHEN status='OPEN' AND assigned_to IS NOT NULL THEN 'IN_PROGRESS' ELSE status END,
           version=version+1,updated_at=now() WHERE id=$1 RETURNING *`,
          [before.id, order.id, subject, body],
        );
        await client.query(
          `INSERT INTO ticket_audit(id,ticket_id,actor_id,action,before_data,after_data)
           VALUES($1,$2,NULL,'DEMO_FIXTURE_REPAIRED',$3,$4)`,
          [
            randomUUID(),
            before.id,
            JSON.stringify(before),
            JSON.stringify(after),
          ],
        );
      }
      repaired.push({
        ticketId: before.id,
        orderCode: order.code,
        skus: order.skus,
      });
    }
    await client.query(apply ? "COMMIT" : "ROLLBACK");
    console.log(
      JSON.stringify({
        mode: apply ? "apply" : "dry-run",
        eligible: rows.length,
        repaired: repaired.length,
        skipped,
        fixtures: repaired,
      }),
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
