import { MigrationInterface, QueryRunner } from "typeorm";
export class TicketsAi1780000600000 implements MigrationInterface {
  async up(r: QueryRunner): Promise<void> {
    const s = (r.connection.options as { schema?: string }).schema ?? "public";
    const t = (n: string) => `"${s}".${n}`;
    await r.query(
      `CREATE TABLE ${t("tickets")} (id uuid PRIMARY KEY,customer_id uuid NOT NULL REFERENCES ${t("users")}(id),order_id uuid REFERENCES ${t("orders")}(id),subject text NOT NULL CHECK(length(subject) BETWEEN 5 AND 150),body text NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','IN_PROGRESS','RESOLVED','CLOSED')),assigned_to uuid REFERENCES ${t("users")}(id),category text NOT NULL DEFAULT 'OTHER' CHECK(category IN ('ORDER_STATUS','PAYMENT','INVENTORY','DELIVERY','CANCELLATION','OTHER')),classification_status text NOT NULL DEFAULT 'PENDING',classification_source text NOT NULL DEFAULT 'AI',classification_version integer NOT NULL DEFAULT 1,confidence double precision,classification_reason text,needs_review boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 1,resolved_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())`,
    );
    await r.query(
      `CREATE INDEX tickets_customer_idx ON ${t("tickets")}(customer_id,created_at,id)`,
    );
    await r.query(
      `CREATE TABLE ${t("ai_sessions")} (id uuid PRIMARY KEY,ticket_id uuid NOT NULL REFERENCES ${t("tickets")}(id),actor_id uuid NOT NULL REFERENCES ${t("users")}(id),expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',created_at timestamptz NOT NULL DEFAULT now())`,
    );
    await r.query(
      `CREATE TABLE ${t("ai_turns")} (id uuid PRIMARY KEY,session_id uuid NOT NULL REFERENCES ${t("ai_sessions")}(id),client_message_id uuid NOT NULL,message text NOT NULL CHECK(length(message) BETWEEN 1 AND 4000),status text NOT NULL DEFAULT 'PROCESSING',response jsonb,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(session_id,client_message_id))`,
    );
    await r.query(
      `CREATE TABLE ${t("ticket_messages")} (id uuid PRIMARY KEY,ticket_id uuid NOT NULL REFERENCES ${t("tickets")}(id),author_id uuid NOT NULL REFERENCES ${t("users")}(id),body text NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),approved_ai_message_id uuid REFERENCES ${t("ai_turns")}(id),created_at timestamptz NOT NULL DEFAULT now())`,
    );
    await r.query(
      `CREATE TABLE ${t("ai_proposals")} (id uuid PRIMARY KEY,session_id uuid NOT NULL REFERENCES ${t("ai_sessions")}(id),ticket_id uuid NOT NULL REFERENCES ${t("tickets")}(id),actor_id uuid NOT NULL REFERENCES ${t("users")}(id),action text NOT NULL CHECK(action='SET_TICKET_CATEGORY'),payload jsonb NOT NULL,expected_version integer NOT NULL,expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','EXECUTED','REJECTED')),result jsonb,created_at timestamptz NOT NULL DEFAULT now())`,
    );
    await r.query(
      `CREATE TABLE ${t("ticket_audit")} (id uuid PRIMARY KEY,ticket_id uuid NOT NULL REFERENCES ${t("tickets")}(id),actor_id uuid REFERENCES ${t("users")}(id),action text NOT NULL,before_data jsonb,after_data jsonb,created_at timestamptz NOT NULL DEFAULT now())`,
    );
    await r.query(
      `CREATE FUNCTION "${s}".immutable_ai_proposal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.payload IS DISTINCT FROM OLD.payload OR NEW.action IS DISTINCT FROM OLD.action OR NEW.actor_id IS DISTINCT FROM OLD.actor_id OR NEW.ticket_id IS DISTINCT FROM OLD.ticket_id OR NEW.session_id IS DISTINCT FROM OLD.session_id OR NEW.expected_version IS DISTINCT FROM OLD.expected_version OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN RAISE EXCEPTION 'immutable proposal'; END IF; RETURN NEW; END $$`,
    );
    await r.query(
      `CREATE TRIGGER immutable_proposal BEFORE UPDATE ON ${t("ai_proposals")} FOR EACH ROW EXECUTE FUNCTION "${s}".immutable_ai_proposal()`,
    );
  }
  async down(r: QueryRunner): Promise<void> {
    const s = (r.connection.options as { schema?: string }).schema ?? "public";
    for (const n of [
      "ticket_audit",
      "ai_proposals",
      "ticket_messages",
      "ai_turns",
      "ai_sessions",
      "tickets",
    ])
      await r.query(`DROP TABLE "${s}".${n}`);
    await r.query(`DROP FUNCTION "${s}".immutable_ai_proposal()`);
  }
}
