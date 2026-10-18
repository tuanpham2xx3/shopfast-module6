import { createHash, randomUUID } from "node:crypto";
import { DataSource, EntityManager } from "typeorm";
import { enqueueOutbox } from "../../platform/src/outbox/outbox";

export class OrderError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
export interface CheckoutInput {
  items: { productId: string; quantity: number; expectedUnitPrice: number }[];
  shippingAddress: {
    recipientName: string;
    addressLine: string;
    phone: string;
    ward: string;
    province: string;
  };
  promoCode?: string;
}
type Actor = { id: string; role: string };
export class OrderService {
  async createPromotion(input: {
    code: string;
    amount: number;
    minOrderAmount: number;
    startsAt: string;
    endsAt: string;
    totalQuota: number;
  }) {
    if (new Date(input.endsAt) <= new Date(input.startsAt))
      throw new OrderError("BAD_REQUEST");
    const [row] = await this.source.query(
      `INSERT INTO ${this.t("promotions")} (id,code,amount,min_order_amount,starts_at,ends_at,total_quota) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,code`,
      [
        randomUUID(),
        input.code.trim().toUpperCase(),
        input.amount,
        input.minOrderAmount,
        input.startsAt,
        input.endsAt,
        input.totalQuota,
      ],
    );
    return row;
  }
  async setPromotion(id: string, active: boolean) {
    const [[row]] = await this.source.query(
      `UPDATE ${this.t("promotions")} SET active=$2 WHERE id=$1 RETURNING id,code,active`,
      [id, active],
    );
    if (!row) throw new OrderError("NOT_FOUND");
    return row;
  }
  async expireDue(at = new Date()) {
    return this.source.transaction(async (m) => {
      const orders = await m.query(
        `SELECT id,version,status FROM ${this.t("orders")} WHERE status='PENDING_PAYMENT' AND expires_at<=$1 ORDER BY expires_at,id LIMIT 100 FOR UPDATE SKIP LOCKED`,
        [at],
      );
      // Keep one global inventory order across the entire expiry batch.
      await m.query(
        `SELECT product_id FROM ${this.t("inventories")} WHERE product_id IN (SELECT r.product_id FROM ${this.t("reservations")} r JOIN ${this.t("order_items")} oi ON oi.id=r.order_item_id WHERE oi.order_id=ANY($1::uuid[])) ORDER BY product_id FOR UPDATE`,
        [orders.map((o: { id: string }) => o.id)],
      );
      for (const order of orders) {
        const rows = await m.query(
          `SELECT r.* FROM ${this.t("reservations")} r JOIN ${this.t("order_items")} oi ON oi.id=r.order_item_id WHERE oi.order_id=$1 ORDER BY r.product_id`,
          [order.id],
        );
        for (const r of rows) {
          if (r.status !== "ACTIVE") throw new OrderError("INVALID_TRANSITION");
          await m.query(
            `SELECT product_id FROM ${this.t("inventories")} WHERE product_id=$1 FOR UPDATE`,
            [r.product_id],
          );
          await m.query(
            `UPDATE ${this.t("inventories")} SET reserved=reserved-$2,version=version+1 WHERE product_id=$1`,
            [r.product_id, r.quantity],
          );
          await m.query(
            `UPDATE ${this.t("reservations")} SET status='RELEASED' WHERE order_item_id=$1`,
            [r.order_item_id],
          );
          await m.query(
            `INSERT INTO ${this.t("inventory_movements")} (id,product_id,order_id,delta_on_hand,delta_reserved,reason,business_key) VALUES($1,$2,$3,0,$4,'EXPIRED',$5)`,
            [
              randomUUID(),
              r.product_id,
              order.id,
              -r.quantity,
              `expire:${r.order_item_id}`,
            ],
          );
        }
        await m.query(
          `UPDATE ${this.t("orders")} SET status='EXPIRED',version=version+1,updated_at=now() WHERE id=$1`,
          [order.id],
        );
        await this.history(
          m,
          order.id,
          "PENDING_PAYMENT",
          "EXPIRED",
          null,
          order.version + 1,
          "Payment deadline elapsed",
        );
        await this.event(m, order.id, order.version + 1, "order.changed");
      }
      return orders.length;
    });
  }
  constructor(
    private readonly source: DataSource,
    private readonly schema = "public",
  ) {
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema))
      throw new Error("Invalid schema");
  }
  private t(n: string) {
    return `"${this.schema}".${n}`;
  }
  private async idem<T>(
    actor: string,
    route: string,
    key: string,
    payload: unknown,
    work: (m: EntityManager) => Promise<T>,
  ): Promise<T> {
    if (!key || key.length < 8 || key.length > 128)
      throw new OrderError("BAD_REQUEST");
    const hash = createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex");
    return this.source.transaction(async (m) => {
      const [{ locked }] = await m.query(
        `SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) locked`,
        [`${this.schema}:${actor}:${route}:${key}`],
      );
      if (!locked) throw new OrderError("REQUEST_IN_PROGRESS");
      const [old] = await m.query(
        `SELECT * FROM ${this.t("idempotency_records")} WHERE user_id=$1 AND route=$2 AND key=$3 AND expires_at>now()`,
        [actor, route, key],
      );
      if (old) {
        if (old.request_hash !== hash)
          throw new OrderError("IDEMPOTENCY_CONFLICT");
        return old.response as T;
      }
      await m.query(
        `DELETE FROM ${this.t("idempotency_records")} WHERE user_id=$1 AND route=$2 AND key=$3`,
        [actor, route, key],
      );
      const result = await work(m);
      await m.query(
        `INSERT INTO ${this.t("idempotency_records")} (user_id,route,key,request_hash,status_code,response,expires_at) VALUES($1,$2,$3,$4,200,$5,now()+interval '24 hours')`,
        [actor, route, key, hash, JSON.stringify(result)],
      );
      return result;
    });
  }
  async addCart(user: string, product: string, quantity: number) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99)
      throw new OrderError("BAD_REQUEST");
    return this.source.transaction(async (m) => {
      const [p] = await m.query(
        `SELECT p.id FROM ${this.t("products")} p JOIN ${this.t("categories")} c ON c.id=p.category_id JOIN ${this.t("brands")} b ON b.id=p.brand_id WHERE p.id=$1 AND p.active AND c.active AND b.active`,
        [product],
      );
      if (!p) throw new OrderError("NOT_FOUND");
      const rows = await m.query(
        `INSERT INTO ${this.t("cart_items")} (user_id,product_id,quantity) VALUES($1,$2,$3) ON CONFLICT(user_id,product_id) DO UPDATE SET quantity=${this.t("cart_items")}.quantity+EXCLUDED.quantity WHERE ${this.t("cart_items")}.quantity+EXCLUDED.quantity<=99 RETURNING quantity`,
        [user, product, quantity],
      );
      if (!rows.length) throw new OrderError("BAD_REQUEST");
      return { productId: product, quantity: rows[0].quantity };
    });
  }
  async setCart(user: string, product: string, quantity: number) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99)
      throw new OrderError("BAD_REQUEST");
    const [[row]] = await this.source.query(
      `UPDATE ${this.t("cart_items")} SET quantity=$3 WHERE user_id=$1 AND product_id=$2 RETURNING quantity`,
      [user, product, quantity],
    );
    if (!row) throw new OrderError("NOT_FOUND");
    return row;
  }
  async removeCart(user: string, product: string) {
    await this.source.query(
      `DELETE FROM ${this.t("cart_items")} WHERE user_id=$1 AND product_id=$2`,
      [user, product],
    );
  }
  async cart(user: string) {
    const items = await this.source.query(
      `SELECT p.id AS "productId",p.sku,p.name,p.price::float8 AS price,ci.quantity,i.on_hand-i.reserved available,(p.active AND c.active AND b.active) active FROM ${this.t("cart_items")} ci JOIN ${this.t("products")} p ON p.id=ci.product_id JOIN ${this.t("inventories")} i ON i.product_id=p.id JOIN ${this.t("categories")} c ON c.id=p.category_id JOIN ${this.t("brands")} b ON b.id=p.brand_id WHERE ci.user_id=$1 ORDER BY p.id`,
      [user],
    );
    const subtotal = items.reduce(
      (sum: number, item: { price: number; quantity: number }) =>
        sum + item.price * item.quantity,
      0,
    );
    if (!Number.isSafeInteger(subtotal)) throw new OrderError("BAD_REQUEST");
    return { items, subtotal };
  }
  async checkout(customer: string, key: string, input: CheckoutInput) {
    if (
      !input.items.length ||
      input.items.length > 50 ||
      new Set(input.items.map((i) => i.productId)).size !==
        input.items.length ||
      input.items.some(
        (i) =>
          !Number.isInteger(i.quantity) ||
          i.quantity < 1 ||
          i.quantity > 99 ||
          !Number.isSafeInteger(i.expectedUnitPrice) ||
          i.expectedUnitPrice < 0,
      )
    )
      throw new OrderError("BAD_REQUEST");
    const items = [...input.items].sort((a, b) =>
      a.productId.localeCompare(b.productId),
    );
    const normalized = {
      items,
      shippingAddress: {
        recipientName: input.shippingAddress.recipientName,
        addressLine: input.shippingAddress.addressLine,
        phone: input.shippingAddress.phone,
        ward: input.shippingAddress.ward,
        province: input.shippingAddress.province,
      },
      promoCode: input.promoCode?.trim().toUpperCase(),
    };
    return this.idem(customer, "checkout", key, normalized, async (m) => {
      const productIds = items.map((i) => i.productId);
      await m.query(
        `SELECT id FROM ${this.t("products")} WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
        [productIds],
      );
      for (const [table, column] of [
        ["categories", "category_id"],
        ["brands", "brand_id"],
      ]) {
        await m.query(
          `SELECT id FROM ${this.t(table!)} WHERE id IN (SELECT ${column} FROM ${this.t("products")} WHERE id=ANY($1::uuid[])) ORDER BY id FOR SHARE`,
          [productIds],
        );
      }
      const rows = await m.query(
        `SELECT p.*,i.on_hand,i.reserved,c.active category_active,b.active brand_active FROM ${this.t("products")} p JOIN ${this.t("inventories")} i ON i.product_id=p.id JOIN ${this.t("categories")} c ON c.id=p.category_id JOIN ${this.t("brands")} b ON b.id=p.brand_id WHERE p.id=ANY($1::uuid[]) ORDER BY p.id FOR UPDATE OF i`,
        [items.map((i) => i.productId)],
      );
      if (rows.length !== items.length) throw new OrderError("NOT_FOUND");
      let subtotal = 0;
      for (const item of items) {
        const p = rows.find((r: { id: string }) => r.id === item.productId);
        if (!p.active || !p.category_active || !p.brand_active)
          throw new OrderError("NOT_FOUND");
        if (Number(p.price) !== item.expectedUnitPrice)
          throw new OrderError("PRICE_CHANGED");
        if (p.on_hand - p.reserved < item.quantity)
          throw new OrderError("OUT_OF_STOCK");
        subtotal += Number(p.price) * item.quantity;
      }
      if (!Number.isSafeInteger(subtotal)) throw new OrderError("BAD_REQUEST");
      let promotion;
      let discount = 0;
      if (normalized.promoCode) {
        [promotion] = await m.query(
          `SELECT * FROM ${this.t("promotions")} WHERE code=$1 FOR UPDATE`,
          [normalized.promoCode],
        );
        if (
          !promotion ||
          !promotion.active ||
          new Date(promotion.starts_at) > new Date() ||
          new Date(promotion.ends_at) <= new Date() ||
          subtotal < Number(promotion.min_order_amount)
        )
          throw new OrderError("PROMO_NOT_ELIGIBLE");
        if (promotion.used_count >= promotion.total_quota)
          throw new OrderError("PROMO_EXHAUSTED");
        const [used] = await m.query(
          `SELECT order_id FROM ${this.t("promotion_redemptions")} WHERE promotion_id=$1 AND customer_id=$2`,
          [promotion.id, customer],
        );
        if (used) throw new OrderError("PROMO_NOT_ELIGIBLE");
        discount = Math.min(subtotal, Number(promotion.amount));
      }
      const id = randomUUID();
      const code = `SF${new Date().toISOString().slice(0, 10).replace(/-/g, "")}${randomUUID().slice(0, 8).toUpperCase()}`;
      await m.query(
        `INSERT INTO ${this.t("orders")} (id,code,customer_id,status,payment_status,subtotal,discount,total,address_snapshot,promo_id,expires_at) VALUES($1,$2,$3,'PENDING_PAYMENT','UNPAID',$4,$5,$6,$7,$8,now()+interval '60 minutes')`,
        [
          id,
          code,
          customer,
          subtotal,
          discount,
          subtotal - discount,
          JSON.stringify(normalized.shippingAddress),
          promotion?.id ?? null,
        ],
      );
      for (const item of items) {
        const p = rows.find((r: { id: string }) => r.id === item.productId);
        const itemId = randomUUID();
        await m.query(
          `INSERT INTO ${this.t("order_items")} (id,order_id,product_id,sku_snapshot,name_snapshot,unit_price,quantity,line_total) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            itemId,
            id,
            p.id,
            p.sku,
            p.name,
            p.price,
            item.quantity,
            Number(p.price) * item.quantity,
          ],
        );
        await m.query(
          `INSERT INTO ${this.t("reservations")} (order_item_id,product_id,quantity,status) VALUES($1,$2,$3,'ACTIVE')`,
          [itemId, p.id, item.quantity],
        );
        await m.query(
          `UPDATE ${this.t("inventories")} SET reserved=reserved+$2,version=version+1 WHERE product_id=$1`,
          [p.id, item.quantity],
        );
        await m.query(
          `INSERT INTO ${this.t("inventory_movements")} (id,product_id,order_id,actor_id,delta_on_hand,delta_reserved,reason,business_key) VALUES($1,$2,$3,$4,0,$5,'CHECKOUT',$6)`,
          [
            randomUUID(),
            p.id,
            id,
            customer,
            item.quantity,
            `reserve:${itemId}`,
          ],
        );
        await m.query(
          `DELETE FROM ${this.t("cart_items")} WHERE user_id=$1 AND product_id=$2 AND quantity<=$3`,
          [customer, p.id, item.quantity],
        );
        await m.query(
          `UPDATE ${this.t("cart_items")} SET quantity=quantity-$3 WHERE user_id=$1 AND product_id=$2`,
          [customer, p.id, item.quantity],
        );
      }
      if (promotion) {
        await m.query(
          `UPDATE ${this.t("promotions")} SET used_count=used_count+1 WHERE id=$1`,
          [promotion.id],
        );
        await m.query(
          `INSERT INTO ${this.t("promotion_redemptions")} VALUES($1,$2,$3)`,
          [promotion.id, customer, id],
        );
      }
      await m.query(
        `INSERT INTO ${this.t("payments")} (order_id,status,amount) VALUES($1,'UNPAID',$2)`,
        [id, subtotal - discount],
      );
      await this.history(
        m,
        id,
        null,
        "PENDING_PAYMENT",
        customer,
        1,
        "CHECKOUT",
      );
      await this.event(m, id, 1, "order.created");
      return this.read(m, id);
    });
  }
  private async read(m: EntityManager, id: string) {
    const [order] = await m.query(
      `SELECT id,code,customer_id AS "customerId",status,payment_status AS "paymentStatus",subtotal::float8 subtotal,discount::float8 discount,total::float8 total,address_snapshot AS address,expires_at AS "expiresAt",version,created_at AS "createdAt" FROM ${this.t("orders")} WHERE id=$1`,
      [id],
    );
    if (!order) throw new OrderError("NOT_FOUND");
    order.items = await m.query(
      `SELECT product_id AS "productId",sku_snapshot sku,name_snapshot name,unit_price::float8 AS "unitPrice",quantity,line_total::float8 AS "lineTotal" FROM ${this.t("order_items")} WHERE order_id=$1 ORDER BY product_id`,
      [id],
    );
    order.history = await m.query(
      `SELECT from_status AS "fromStatus",to_status AS "toStatus",order_version AS version,reason,created_at AS "createdAt" FROM ${this.t("order_status_history")} WHERE order_id=$1 ORDER BY order_version`,
      [id],
    );
    return JSON.parse(JSON.stringify(order));
  }
  async detail(id: string, customer?: string) {
    const result = await this.source.transaction((m) => this.read(m, id));
    if (customer && result.customerId !== customer)
      throw new OrderError("NOT_FOUND");
    return result;
  }
  async list(
    customer?: string,
    status?: string,
    page = 1,
    pageSize = 20,
    code?: string,
  ) {
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    )
      throw new OrderError("BAD_REQUEST");
    const rows = await this.source.query(
      `SELECT id,code,status,payment_status AS "paymentStatus",total::float8 total,version,created_at AS "createdAt" FROM ${this.t("orders")} WHERE ($1::uuid IS NULL OR customer_id=$1) AND ($2::text IS NULL OR status=$2) AND ($3::text IS NULL OR code=$3) ORDER BY created_at DESC,id LIMIT $4 OFFSET $5`,
      [
        customer ?? null,
        status ?? null,
        code ?? null,
        pageSize,
        (page - 1) * pageSize,
      ],
    );
    const [{ count }] = await this.source.query(
      `SELECT count(*)::int count FROM ${this.t("orders")} WHERE ($1::uuid IS NULL OR customer_id=$1) AND ($2::text IS NULL OR status=$2) AND ($3::text IS NULL OR code=$3)`,
      [customer ?? null, status ?? null, code ?? null],
    );
    return { items: rows, total: count, page, pageSize };
  }
  private async history(
    m: EntityManager,
    id: string,
    from: string | null,
    to: string,
    actor: string | null,
    version: number,
    reason: string,
  ) {
    await m.query(
      `INSERT INTO ${this.t("order_status_history")} (id,order_id,from_status,to_status,actor_id,reason,source,order_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        randomUUID(),
        id,
        from,
        to,
        actor,
        reason,
        actor ? "HUMAN" : "WORKER",
        version,
      ],
    );
  }
  private async event(
    m: EntityManager,
    id: string,
    version: number,
    type: string,
  ) {
    await enqueueOutbox(
      m,
      {
        id: randomUUID(),
        businessKey: `${type}:${id}:${version}`,
        type,
        aggregateId: id,
        aggregateVersion: version,
        payload: { orderId: id, version },
      },
      this.schema,
    );
  }
  async transition(
    id: string,
    actor: Actor,
    target: string,
    expectedVersion: number,
    key: string,
    reason = "",
  ) {
    return this.idem(
      actor.id,
      `order:${id}:${target === "CONFIRMED" ? "payment" : target === "CANCELLED" ? "cancel" : "status"}`,
      key,
      { target, expectedVersion, reason },
      async (m) => {
        const [order] = await m.query(
          `SELECT * FROM ${this.t("orders")} WHERE id=$1 FOR UPDATE`,
          [id],
        );
        if (
          !order ||
          (actor.role === "CUSTOMER" && order.customer_id !== actor.id)
        )
          throw new OrderError("NOT_FOUND");
        const staff = ["WAREHOUSE", "ADMIN"].includes(actor.role);
        if (
          (target === "CONFIRMED" && actor.role !== "CUSTOMER") ||
          (["PROCESSING", "SHIPPING", "DELIVERED"].includes(target) &&
            !staff) ||
          (target === "CANCELLED" &&
            !["CUSTOMER", "ADMIN"].includes(actor.role))
        )
          throw new OrderError("FORBIDDEN");
        if (order.version !== expectedVersion)
          throw new OrderError("VERSION_CONFLICT");
        const allowed: Record<string, string[]> = {
          PENDING_PAYMENT: ["CONFIRMED", "CANCELLED"],
          CONFIRMED: ["PROCESSING", "CANCELLED"],
          PROCESSING: ["SHIPPING"],
          SHIPPING: ["DELIVERED"],
        };
        if (!allowed[order.status]?.includes(target))
          throw new OrderError("INVALID_TRANSITION");
        if (target === "CONFIRMED" && new Date(order.expires_at) <= new Date())
          throw new OrderError("INVALID_TRANSITION");
        if (target === "CANCELLED" && reason.trim().length < 5)
          throw new OrderError("BAD_REQUEST");
        if (["SHIPPING", "CANCELLED"].includes(target)) {
          const reservations = await m.query(
            `SELECT r.* FROM ${this.t("reservations")} r JOIN ${this.t("order_items")} oi ON oi.id=r.order_item_id WHERE oi.order_id=$1 ORDER BY r.product_id`,
            [id],
          );
          for (const r of reservations) {
            if (r.status !== "ACTIVE")
              throw new OrderError("INVALID_TRANSITION");
            await m.query(
              `SELECT product_id FROM ${this.t("inventories")} WHERE product_id=$1 FOR UPDATE`,
              [r.product_id],
            );
            await m.query(
              `UPDATE ${this.t("inventories")} SET reserved=reserved-$2,on_hand=on_hand-$3,version=version+1 WHERE product_id=$1`,
              [
                r.product_id,
                r.quantity,
                target === "SHIPPING" ? r.quantity : 0,
              ],
            );
            await m.query(
              `UPDATE ${this.t("reservations")} SET status=$2 WHERE order_item_id=$1`,
              [
                r.order_item_id,
                target === "SHIPPING" ? "CONSUMED" : "RELEASED",
              ],
            );
            await m.query(
              `INSERT INTO ${this.t("inventory_movements")} (id,product_id,order_id,actor_id,delta_on_hand,delta_reserved,reason,business_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
              [
                randomUUID(),
                r.product_id,
                id,
                actor.id,
                target === "SHIPPING" ? -r.quantity : 0,
                -r.quantity,
                target,
                `${target}:${r.order_item_id}`,
              ],
            );
          }
        }
        const payment =
          target === "CONFIRMED"
            ? "PAID"
            : target === "CANCELLED" && order.payment_status === "PAID"
              ? "REFUNDED"
              : order.payment_status;
        await m.query(
          `UPDATE ${this.t("orders")} SET status=$2,payment_status=$3,version=version+1,updated_at=now() WHERE id=$1`,
          [id, target, payment],
        );
        await m.query(
          `UPDATE ${this.t("payments")} SET status=$2,paid_at=CASE WHEN $2='PAID' THEN COALESCE(paid_at,now()) ELSE paid_at END,refunded_at=CASE WHEN $2='REFUNDED' THEN now() ELSE refunded_at END WHERE order_id=$1`,
          [id, payment],
        );
        await this.history(
          m,
          id,
          order.status,
          target,
          actor.id,
          order.version + 1,
          reason,
        );
        await this.event(
          m,
          id,
          order.version + 1,
          target === "CONFIRMED" ? "payment.confirmed" : "order.changed",
        );
        return this.read(m, id);
      },
    );
  }
}
