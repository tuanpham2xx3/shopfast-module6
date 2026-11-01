import { createHash, randomUUID } from "node:crypto";
import { DataSource, EntityManager } from "typeorm";
import { domainEvents } from "../../../../platform/src/domain-events";
import { enqueueOutbox } from "../../../../platform/src/outbox/outbox";
import { CatalogCache } from "../../../runtime/src/catalog-cache";
import { enqueueCatalogInvalidation } from "../../../runtime/src/catalog-invalidation";
import { Actor, CheckoutInput, OrderError } from "../order.contracts";
import { OrderRepository } from "../persistence/order.repository";
export class OrderService {
  private readonly repository: OrderRepository;
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
    const [row] = await this.repository.createPromotionPromotionsInsert(
      this.source,
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
    const [[row]] = await this.repository.setPromotionPromotionsUpdate(
      this.source,
      [id, active],
    );
    if (!row) throw new OrderError("NOT_FOUND");
    return row;
  }
  async expireDue(at = new Date()) {
    const tags: string[] = [];
    const result = await this.source.transaction(async (m) => {
      const orders = await this.repository.expireDueOrdersSelect(m, [at]);
      // Keep one global inventory order across the entire expiry batch.
      await this.repository.expireDueInventoriesSelect(m, [
        orders.map((o: { id: string }) => o.id),
      ]);
      for (const order of orders) {
        const rows = await this.repository.expireDueReservationsSelect(m, [
          order.id,
        ]);
        for (const r of rows) {
          if (r.status !== "ACTIVE") throw new OrderError("INVALID_TRANSITION");
          await this.repository.expireDueInventoriesSelect2(m, [r.product_id]);
          await this.repository.expireDueInventoriesUpdate(m, [
            r.product_id,
            r.quantity,
          ]);
          await this.repository.expireDueReservationsUpdate(m, [
            r.order_item_id,
          ]);
          await this.repository.expireDueInventoryMovementsInsert(m, [
            randomUUID(),
            r.product_id,
            order.id,
            -r.quantity,
            `expire:${r.order_item_id}`,
          ]);
        }
        await this.repository.expireDueOrdersUpdate(m, [order.id]);
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
        tags.push(
          ...(await enqueueCatalogInvalidation(
            m,
            this.schema,
            order.id,
            rows.map((r: { product_id: string }) => r.product_id),
            [],
            order.version + 1,
          )),
        );
      }
      return orders.length;
    });
    if (tags.length && this.cache) await this.cache.invalidate(tags);
    return result;
  }
  constructor(
    private readonly source: DataSource,
    private readonly schema = "public",
    private readonly cache?: CatalogCache,
  ) {
    this.repository = new OrderRepository(this.schema);
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema))
      throw new Error("Invalid schema");
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
    return this.source
      .transaction(async (m) => {
        const [{ locked }] = await this.repository.idemLockSelect(m, [
          `${this.schema}:${actor}:${route}:${key}`,
        ]);
        if (!locked) throw new OrderError("REQUEST_IN_PROGRESS");
        const [old] = await this.repository.idemIdempotencyRecordsSelect(m, [
          actor,
          route,
          key,
        ]);
        if (old) {
          if (old.request_hash !== hash)
            throw new OrderError("IDEMPOTENCY_CONFLICT");
          return old.response as T;
        }
        await this.repository.idemIdempotencyRecordsDelete(m, [
          actor,
          route,
          key,
        ]);
        const result = await work(m);
        await this.repository.idemIdempotencyRecordsInsert(m, [
          actor,
          route,
          key,
          hash,
          JSON.stringify(result),
        ]);
        return result;
      })
      .then(async (result) => {
        const order = result as { id?: string; version?: number };
        if (order?.id && order.version) {
          if (this.cache) {
            const invalidations: { payload: { tags: string[] } }[] =
              await this.repository.idemOutboxEventsSelect(this.source, [
                order.id,
                order.version,
              ]);
            const tags = invalidations.flatMap((event) => event.payload.tags);
            if (tags.length && !(await this.cache.invalidate(tags)))
              Object.assign(result as object, {
                cacheInvalidationPending: true,
              });
          }
          try {
            const [event] = await this.repository.idemOutboxEventsSelect2(
              this.source,
              [order.id, order.version],
            );
            if (event)
              domainEvents.emit("order.status.updated", {
                ...event,
                occurredAt: new Date(event.occurredAt).toISOString(),
              });
          } catch {
            /* The committed outbox will retry delivery. */
          }
        }
        return result;
      });
  }
  async addCart(user: string, product: string, quantity: number) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99)
      throw new OrderError("BAD_REQUEST");
    return this.source.transaction(async (m) => {
      const [p] = await this.repository.addCartProductsSelect(m, [product]);
      if (!p) throw new OrderError("NOT_FOUND");
      const rows = await this.repository.addCartCartItemsInsert(m, [
        user,
        product,
        quantity,
      ]);
      if (!rows.length) throw new OrderError("BAD_REQUEST");
      return { productId: product, quantity: rows[0].quantity };
    });
  }
  async setCart(user: string, product: string, quantity: number) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99)
      throw new OrderError("BAD_REQUEST");
    const [[row]] = await this.repository.setCartCartItemsUpdate(this.source, [
      user,
      product,
      quantity,
    ]);
    if (!row) throw new OrderError("NOT_FOUND");
    return row;
  }
  async removeCart(user: string, product: string) {
    await this.repository.removeCartCartItemsDelete(this.source, [
      user,
      product,
    ]);
  }
  async cart(user: string) {
    const items = await this.repository.cartCartItemsSelect(this.source, [
      user,
    ]);
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
      await this.repository.checkoutProductsSelect(m, [productIds]);
      for (const [table, column] of [
        ["categories", "category_id"],
        ["brands", "brand_id"],
      ]) {
        await this.repository.checkoutProductsSelect2(
          m,
          [productIds],
          table!,
          column,
        );
      }
      const rows = await this.repository.checkoutProductsSelect3(m, [
        items.map((i) => i.productId),
      ]);
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
        [promotion] = await this.repository.checkoutPromotionsSelect(m, [
          normalized.promoCode,
        ]);
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
        const [used] = await this.repository.checkoutPromotionRedemptionsSelect(
          m,
          [promotion.id, customer],
        );
        if (used) throw new OrderError("PROMO_NOT_ELIGIBLE");
        discount = Math.min(subtotal, Number(promotion.amount));
      }
      const id = randomUUID();
      const code = `SF${new Date().toISOString().slice(0, 10).replace(/-/g, "")}${randomUUID().slice(0, 8).toUpperCase()}`;
      await this.repository.checkoutOrdersInsert(m, [
        id,
        code,
        customer,
        subtotal,
        discount,
        subtotal - discount,
        JSON.stringify(normalized.shippingAddress),
        promotion?.id ?? null,
      ]);
      for (const item of items) {
        const p = rows.find((r: { id: string }) => r.id === item.productId);
        const itemId = randomUUID();
        await this.repository.checkoutOrderItemsInsert(m, [
          itemId,
          id,
          p.id,
          p.sku,
          p.name,
          p.price,
          item.quantity,
          Number(p.price) * item.quantity,
        ]);
        await this.repository.checkoutReservationsInsert(m, [
          itemId,
          p.id,
          item.quantity,
        ]);
        await this.repository.checkoutInventoriesUpdate(m, [
          p.id,
          item.quantity,
        ]);
        await this.repository.checkoutInventoryMovementsInsert(m, [
          randomUUID(),
          p.id,
          id,
          customer,
          item.quantity,
          `reserve:${itemId}`,
        ]);
        await this.repository.checkoutCartItemsDelete(m, [
          customer,
          p.id,
          item.quantity,
        ]);
        await this.repository.checkoutCartItemsUpdate(m, [
          customer,
          p.id,
          item.quantity,
        ]);
      }
      if (promotion) {
        await this.repository.checkoutPromotionsUpdate(m, [promotion.id]);
        await this.repository.checkoutPromotionRedemptionsInsert(m, [
          promotion.id,
          customer,
          id,
        ]);
      }
      await this.repository.checkoutPaymentsInsert(m, [
        id,
        subtotal - discount,
      ]);
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
      await enqueueCatalogInvalidation(m, this.schema, id, productIds, [], 1);
      return this.read(m, id);
    });
  }
  private async read(m: EntityManager, id: string) {
    const [order] = await this.repository.readOrdersSelect(m, [id]);
    if (!order) throw new OrderError("NOT_FOUND");
    order.items = await this.repository.readOrderItemsSelect(m, [id]);
    order.history = await this.repository.readOrderStatusHistorySelect(m, [id]);
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
    const rows = await this.repository.listOrdersSelect(this.source, [
      customer ?? null,
      status ?? null,
      code ?? null,
      pageSize,
      (page - 1) * pageSize,
    ]);
    const [{ count }] = await this.repository.listOrdersSelect2(this.source, [
      customer ?? null,
      status ?? null,
      code ?? null,
    ]);
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
    await this.repository.historyOrderStatusHistoryInsert(m, [
      randomUUID(),
      id,
      from,
      to,
      actor,
      reason,
      actor ? "HUMAN" : "WORKER",
      version,
    ]);
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
        const [order] = await this.repository.transitionOrdersSelect(m, [id]);
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
          const reservations =
            await this.repository.transitionReservationsSelect(m, [id]);
          for (const r of reservations) {
            if (r.status !== "ACTIVE")
              throw new OrderError("INVALID_TRANSITION");
            await this.repository.transitionInventoriesSelect(m, [
              r.product_id,
            ]);
            await this.repository.transitionInventoriesUpdate(m, [
              r.product_id,
              r.quantity,
              target === "SHIPPING" ? r.quantity : 0,
            ]);
            await this.repository.transitionReservationsUpdate(m, [
              r.order_item_id,
              target === "SHIPPING" ? "CONSUMED" : "RELEASED",
            ]);
            await this.repository.transitionInventoryMovementsInsert(m, [
              randomUUID(),
              r.product_id,
              id,
              actor.id,
              target === "SHIPPING" ? -r.quantity : 0,
              -r.quantity,
              target,
              `${target}:${r.order_item_id}`,
            ]);
          }
        }
        const payment =
          target === "CONFIRMED"
            ? "PAID"
            : target === "CANCELLED" && order.payment_status === "PAID"
              ? "REFUNDED"
              : order.payment_status;
        await this.repository.transitionOrdersUpdate(m, [id, target, payment]);
        await this.repository.transitionPaymentsUpdate(m, [id, payment]);
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
        if (["SHIPPING", "CANCELLED"].includes(target)) {
          const products: { product_id: string }[] =
            await this.repository.transitionOrderItemsSelect(m, [id]);
          await enqueueCatalogInvalidation(
            m,
            this.schema,
            id,
            products.map((row) => row.product_id),
            [],
            order.version + 1,
          );
        }
        return this.read(m, id);
      },
    );
  }
}
