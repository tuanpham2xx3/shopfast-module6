import { MigrationInterface, QueryRunner } from "typeorm";
export class Orders1780000400000 implements MigrationInterface {
  async up(r: QueryRunner): Promise<void> {
    const s = (r.connection.options as { schema?: string }).schema ?? "public";
    const t = (n: string) => `"${s}".${n}`;
    await r.query(
      `CREATE TABLE ${t("cart_items")} (user_id uuid NOT NULL REFERENCES ${t("users")}(id),product_id uuid NOT NULL REFERENCES ${t("products")}(id),quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 99),PRIMARY KEY(user_id,product_id))`,
    );
    await r.query(
      `CREATE TABLE ${t("promotions")} (id uuid PRIMARY KEY,code text NOT NULL UNIQUE,amount bigint NOT NULL CHECK(amount>0 AND amount<=9007199254740991),min_order_amount bigint NOT NULL CHECK(min_order_amount>=0),starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,total_quota integer NOT NULL CHECK(total_quota>0),used_count integer NOT NULL DEFAULT 0 CHECK(used_count>=0 AND used_count<=total_quota),active boolean NOT NULL DEFAULT true,CHECK(ends_at>starts_at))`,
    );
    await r.query(
      `CREATE TABLE ${t("orders")} (id uuid PRIMARY KEY,code text NOT NULL UNIQUE,customer_id uuid NOT NULL REFERENCES ${t("users")}(id),status text NOT NULL CHECK(status IN ('PENDING_PAYMENT','CONFIRMED','PROCESSING','SHIPPING','DELIVERED','CANCELLED','EXPIRED')),payment_status text NOT NULL CHECK(payment_status IN ('UNPAID','PAID','REFUNDED')),subtotal bigint NOT NULL CHECK(subtotal BETWEEN 0 AND 9007199254740991),discount bigint NOT NULL CHECK(discount>=0 AND discount<=subtotal),total bigint NOT NULL CHECK(total=subtotal-discount),address_snapshot jsonb NOT NULL,promo_id uuid REFERENCES ${t("promotions")}(id),expires_at timestamptz NOT NULL,version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())`,
    );
    await r.query(
      `CREATE INDEX orders_customer_idx ON ${t("orders")}(customer_id,created_at,id)`,
    );
    await r.query(
      `CREATE INDEX orders_expiry_idx ON ${t("orders")}(status,expires_at)`,
    );
    await r.query(
      `CREATE TABLE ${t("order_items")} (id uuid PRIMARY KEY,order_id uuid NOT NULL REFERENCES ${t("orders")}(id),product_id uuid NOT NULL REFERENCES ${t("products")}(id),sku_snapshot text NOT NULL,name_snapshot text NOT NULL,unit_price bigint NOT NULL CHECK(unit_price>=0),quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 99),line_total bigint NOT NULL CHECK(line_total=unit_price*quantity),UNIQUE(order_id,product_id))`,
    );
    await r.query(
      `CREATE TABLE ${t("reservations")} (order_item_id uuid PRIMARY KEY REFERENCES ${t("order_items")}(id),product_id uuid NOT NULL REFERENCES ${t("products")}(id),quantity integer NOT NULL CHECK(quantity>0),status text NOT NULL CHECK(status IN ('ACTIVE','CONSUMED','RELEASED')))`,
    );
    await r.query(
      `CREATE TABLE ${t("order_status_history")} (id uuid PRIMARY KEY,order_id uuid NOT NULL REFERENCES ${t("orders")}(id),from_status text,to_status text NOT NULL,actor_id uuid REFERENCES ${t("users")}(id),reason text,source text NOT NULL,order_version integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(order_id,order_version))`,
    );
    await r.query(
      `CREATE TABLE ${t("payments")} (order_id uuid PRIMARY KEY REFERENCES ${t("orders")}(id),provider text NOT NULL DEFAULT 'MOCK' CHECK(provider='MOCK'),status text NOT NULL CHECK(status IN ('UNPAID','PAID','REFUNDED')),amount bigint NOT NULL CHECK(amount>=0),paid_at timestamptz,refunded_at timestamptz)`,
    );
    await r.query(
      `CREATE TABLE ${t("promotion_redemptions")} (promotion_id uuid NOT NULL REFERENCES ${t("promotions")}(id),customer_id uuid NOT NULL REFERENCES ${t("users")}(id),order_id uuid NOT NULL UNIQUE REFERENCES ${t("orders")}(id),PRIMARY KEY(promotion_id,customer_id))`,
    );
    await r.query(
      `CREATE TABLE ${t("idempotency_records")} (user_id uuid NOT NULL REFERENCES ${t("users")}(id),route text NOT NULL,key text NOT NULL,request_hash text NOT NULL,status_code integer NOT NULL,response jsonb NOT NULL,expires_at timestamptz NOT NULL,PRIMARY KEY(user_id,route,key))`,
    );
    await r.query(
      `CREATE TABLE ${t("inventory_movements")} (id uuid PRIMARY KEY,product_id uuid NOT NULL REFERENCES ${t("products")}(id),order_id uuid REFERENCES ${t("orders")}(id),actor_id uuid REFERENCES ${t("users")}(id),delta_on_hand integer NOT NULL,delta_reserved integer NOT NULL,reason text NOT NULL,business_key text NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT now())`,
    );
  }
  async down(r: QueryRunner): Promise<void> {
    const s = (r.connection.options as { schema?: string }).schema ?? "public";
    for (const n of [
      "inventory_movements",
      "idempotency_records",
      "promotion_redemptions",
      "payments",
      "order_status_history",
      "reservations",
      "order_items",
      "orders",
      "promotions",
      "cart_items",
    ])
      await r.query(`DROP TABLE "${s}".${n}`);
  }
}
