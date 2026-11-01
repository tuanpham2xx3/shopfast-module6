import { EntityManager } from "typeorm";
type QueryExecutor = Pick<EntityManager, "query">;
/** SQL only; the caller owns transaction, lock ordering and commit. */
export class OrderRepository {
  constructor(private readonly schema: string) {}
  private t(name: string) {
    return '\"' + this.schema + '\".' + name;
  }
  createPromotionPromotionsInsert(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `INSERT INTO ${this.t("promotions")} (id,code,amount,min_order_amount,starts_at,ends_at,total_quota) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,code`,
      values,
    );
  }
  setPromotionPromotionsUpdate(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `UPDATE ${this.t("promotions")} SET active=$2 WHERE id=$1 RETURNING id,code,active`,
      values,
    );
  }
  expireDueOrdersSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT id,version,status FROM ${this.t("orders")} WHERE status='PENDING_PAYMENT' AND expires_at<=$1 ORDER BY expires_at,id LIMIT 100 FOR UPDATE SKIP LOCKED`,
      values,
    );
  }
  expireDueInventoriesSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT product_id FROM ${this.t("inventories")} WHERE product_id IN (SELECT r.product_id FROM ${this.t("reservations")} r JOIN ${this.t("order_items")} oi ON oi.id=r.order_item_id WHERE oi.order_id=ANY($1::uuid[])) ORDER BY product_id FOR UPDATE`,
      values,
    );
  }
  expireDueReservationsSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT r.* FROM ${this.t("reservations")} r JOIN ${this.t("order_items")} oi ON oi.id=r.order_item_id WHERE oi.order_id=$1 ORDER BY r.product_id`,
      values,
    );
  }
  expireDueInventoriesSelect2(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT product_id FROM ${this.t("inventories")} WHERE product_id=$1 FOR UPDATE`,
      values,
    );
  }
  expireDueInventoriesUpdate(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `UPDATE ${this.t("inventories")} SET reserved=reserved-$2,version=version+1 WHERE product_id=$1`,
      values,
    );
  }
  expireDueReservationsUpdate(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `UPDATE ${this.t("reservations")} SET status='RELEASED' WHERE order_item_id=$1`,
      values,
    );
  }
  expireDueInventoryMovementsInsert(
    executor: QueryExecutor,
    values: unknown[],
  ) {
    return executor.query(
      `INSERT INTO ${this.t("inventory_movements")} (id,product_id,order_id,delta_on_hand,delta_reserved,reason,business_key) VALUES($1,$2,$3,0,$4,'EXPIRED',$5)`,
      values,
    );
  }
  expireDueOrdersUpdate(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `UPDATE ${this.t("orders")} SET status='EXPIRED',version=version+1,updated_at=now() WHERE id=$1`,
      values,
    );
  }
  idemLockSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) locked`,
      values,
    );
  }
  idemIdempotencyRecordsSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT * FROM ${this.t("idempotency_records")} WHERE user_id=$1 AND route=$2 AND key=$3 AND expires_at>now()`,
      values,
    );
  }
  idemIdempotencyRecordsDelete(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `DELETE FROM ${this.t("idempotency_records")} WHERE user_id=$1 AND route=$2 AND key=$3`,
      values,
    );
  }
  idemIdempotencyRecordsInsert(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `INSERT INTO ${this.t("idempotency_records")} (user_id,route,key,request_hash,status_code,response,expires_at) VALUES($1,$2,$3,$4,200,$5,now()+interval '24 hours')`,
      values,
    );
  }
  idemOutboxEventsSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT payload FROM ${this.t("outbox_events")} WHERE type='catalog.invalidate' AND aggregate_id=$1 AND aggregate_version=$2`,
      values,
    );
  }
  idemOutboxEventsSelect2(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT e.id AS "eventId",e.aggregate_id AS "orderId",h.to_status status,e.aggregate_version version,h.created_at AS "occurredAt" FROM ${this.t("outbox_events")} e JOIN ${this.t("order_status_history")} h ON h.order_id=e.aggregate_id AND h.order_version=e.aggregate_version WHERE e.aggregate_id=$1 AND e.aggregate_version=$2 AND e.type IN ('order.created','order.changed','payment.confirmed') LIMIT 1`,
      values,
    );
  }
  addCartProductsSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT p.id FROM ${this.t("products")} p JOIN ${this.t("categories")} c ON c.id=p.category_id JOIN ${this.t("brands")} b ON b.id=p.brand_id WHERE p.id=$1 AND p.active AND c.active AND b.active`,
      values,
    );
  }
  addCartCartItemsInsert(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `INSERT INTO ${this.t("cart_items")} (user_id,product_id,quantity) VALUES($1,$2,$3) ON CONFLICT(user_id,product_id) DO UPDATE SET quantity=${this.t("cart_items")}.quantity+EXCLUDED.quantity WHERE ${this.t("cart_items")}.quantity+EXCLUDED.quantity<=99 RETURNING quantity`,
      values,
    );
  }
  setCartCartItemsUpdate(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `UPDATE ${this.t("cart_items")} SET quantity=$3 WHERE user_id=$1 AND product_id=$2 RETURNING quantity`,
      values,
    );
  }
  removeCartCartItemsDelete(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `DELETE FROM ${this.t("cart_items")} WHERE user_id=$1 AND product_id=$2`,
      values,
    );
  }
  cartCartItemsSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT p.id AS "productId",p.sku,p.name,p.price::float8 AS price,ci.quantity,i.on_hand-i.reserved available,(p.active AND c.active AND b.active) active FROM ${this.t("cart_items")} ci JOIN ${this.t("products")} p ON p.id=ci.product_id JOIN ${this.t("inventories")} i ON i.product_id=p.id JOIN ${this.t("categories")} c ON c.id=p.category_id JOIN ${this.t("brands")} b ON b.id=p.brand_id WHERE ci.user_id=$1 ORDER BY p.id`,
      values,
    );
  }
  checkoutProductsSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT id FROM ${this.t("products")} WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
      values,
    );
  }
  checkoutProductsSelect2(
    executor: QueryExecutor,
    values: unknown[],
    taxonomyTable: string,
    column: string | undefined,
  ) {
    return executor.query(
      `SELECT id FROM ${this.t(taxonomyTable)} WHERE id IN (SELECT ${column} FROM ${this.t("products")} WHERE id=ANY($1::uuid[])) ORDER BY id FOR SHARE`,
      values,
    );
  }
  checkoutProductsSelect3(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT p.*,i.on_hand,i.reserved,c.active category_active,b.active brand_active FROM ${this.t("products")} p JOIN ${this.t("inventories")} i ON i.product_id=p.id JOIN ${this.t("categories")} c ON c.id=p.category_id JOIN ${this.t("brands")} b ON b.id=p.brand_id WHERE p.id=ANY($1::uuid[]) ORDER BY p.id FOR UPDATE OF i`,
      values,
    );
  }
  checkoutPromotionsSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT * FROM ${this.t("promotions")} WHERE code=$1 FOR UPDATE`,
      values,
    );
  }
  checkoutPromotionRedemptionsSelect(
    executor: QueryExecutor,
    values: unknown[],
  ) {
    return executor.query(
      `SELECT order_id FROM ${this.t("promotion_redemptions")} WHERE promotion_id=$1 AND customer_id=$2`,
      values,
    );
  }
  checkoutOrdersInsert(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `INSERT INTO ${this.t("orders")} (id,code,customer_id,status,payment_status,subtotal,discount,total,address_snapshot,promo_id,expires_at) VALUES($1,$2,$3,'PENDING_PAYMENT','UNPAID',$4,$5,$6,$7,$8,now()+interval '60 minutes')`,
      values,
    );
  }
  checkoutOrderItemsInsert(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `INSERT INTO ${this.t("order_items")} (id,order_id,product_id,sku_snapshot,name_snapshot,unit_price,quantity,line_total) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      values,
    );
  }
  checkoutReservationsInsert(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `INSERT INTO ${this.t("reservations")} (order_item_id,product_id,quantity,status) VALUES($1,$2,$3,'ACTIVE')`,
      values,
    );
  }
  checkoutInventoriesUpdate(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `UPDATE ${this.t("inventories")} SET reserved=reserved+$2,version=version+1 WHERE product_id=$1`,
      values,
    );
  }
  checkoutInventoryMovementsInsert(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `INSERT INTO ${this.t("inventory_movements")} (id,product_id,order_id,actor_id,delta_on_hand,delta_reserved,reason,business_key) VALUES($1,$2,$3,$4,0,$5,'CHECKOUT',$6)`,
      values,
    );
  }
  checkoutCartItemsDelete(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `DELETE FROM ${this.t("cart_items")} WHERE user_id=$1 AND product_id=$2 AND quantity<=$3`,
      values,
    );
  }
  checkoutCartItemsUpdate(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `UPDATE ${this.t("cart_items")} SET quantity=quantity-$3 WHERE user_id=$1 AND product_id=$2`,
      values,
    );
  }
  checkoutPromotionsUpdate(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `UPDATE ${this.t("promotions")} SET used_count=used_count+1 WHERE id=$1`,
      values,
    );
  }
  checkoutPromotionRedemptionsInsert(
    executor: QueryExecutor,
    values: unknown[],
  ) {
    return executor.query(
      `INSERT INTO ${this.t("promotion_redemptions")} VALUES($1,$2,$3)`,
      values,
    );
  }
  checkoutPaymentsInsert(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `INSERT INTO ${this.t("payments")} (order_id,status,amount) VALUES($1,'UNPAID',$2)`,
      values,
    );
  }
  readOrdersSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT id,code,customer_id AS "customerId",status,payment_status AS "paymentStatus",subtotal::float8 subtotal,discount::float8 discount,total::float8 total,address_snapshot AS address,expires_at AS "expiresAt",version,created_at AS "createdAt" FROM ${this.t("orders")} WHERE id=$1`,
      values,
    );
  }
  readOrderItemsSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT product_id AS "productId",sku_snapshot sku,name_snapshot name,unit_price::float8 AS "unitPrice",quantity,line_total::float8 AS "lineTotal" FROM ${this.t("order_items")} WHERE order_id=$1 ORDER BY product_id`,
      values,
    );
  }
  readOrderStatusHistorySelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT from_status AS "fromStatus",to_status AS "toStatus",order_version AS version,reason,created_at AS "createdAt" FROM ${this.t("order_status_history")} WHERE order_id=$1 ORDER BY order_version`,
      values,
    );
  }
  listOrdersSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT id,code,status,payment_status AS "paymentStatus",total::float8 total,version,created_at AS "createdAt" FROM ${this.t("orders")} WHERE ($1::uuid IS NULL OR customer_id=$1) AND ($2::text IS NULL OR status=$2) AND ($3::text IS NULL OR code=$3) ORDER BY created_at DESC,id LIMIT $4 OFFSET $5`,
      values,
    );
  }
  listOrdersSelect2(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT count(*)::int count FROM ${this.t("orders")} WHERE ($1::uuid IS NULL OR customer_id=$1) AND ($2::text IS NULL OR status=$2) AND ($3::text IS NULL OR code=$3)`,
      values,
    );
  }
  historyOrderStatusHistoryInsert(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `INSERT INTO ${this.t("order_status_history")} (id,order_id,from_status,to_status,actor_id,reason,source,order_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      values,
    );
  }
  transitionOrdersSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT * FROM ${this.t("orders")} WHERE id=$1 FOR UPDATE`,
      values,
    );
  }
  transitionReservationsSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT r.* FROM ${this.t("reservations")} r JOIN ${this.t("order_items")} oi ON oi.id=r.order_item_id WHERE oi.order_id=$1 ORDER BY r.product_id`,
      values,
    );
  }
  transitionInventoriesSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT product_id FROM ${this.t("inventories")} WHERE product_id=$1 FOR UPDATE`,
      values,
    );
  }
  transitionInventoriesUpdate(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `UPDATE ${this.t("inventories")} SET reserved=reserved-$2,on_hand=on_hand-$3,version=version+1 WHERE product_id=$1`,
      values,
    );
  }
  transitionReservationsUpdate(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `UPDATE ${this.t("reservations")} SET status=$2 WHERE order_item_id=$1`,
      values,
    );
  }
  transitionInventoryMovementsInsert(
    executor: QueryExecutor,
    values: unknown[],
  ) {
    return executor.query(
      `INSERT INTO ${this.t("inventory_movements")} (id,product_id,order_id,actor_id,delta_on_hand,delta_reserved,reason,business_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      values,
    );
  }
  transitionOrdersUpdate(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `UPDATE ${this.t("orders")} SET status=$2,payment_status=$3,version=version+1,updated_at=now() WHERE id=$1`,
      values,
    );
  }
  transitionPaymentsUpdate(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `UPDATE ${this.t("payments")} SET status=$2,paid_at=CASE WHEN $2='PAID' THEN COALESCE(paid_at,now()) ELSE paid_at END,refunded_at=CASE WHEN $2='REFUNDED' THEN now() ELSE refunded_at END WHERE order_id=$1`,
      values,
    );
  }
  transitionOrderItemsSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT product_id FROM ${this.t("order_items")} WHERE order_id=$1`,
      values,
    );
  }
}
