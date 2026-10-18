import { MigrationInterface, QueryRunner } from "typeorm";

export class Auth1780000100000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    const schema =
      (runner.connection.options as { schema?: string }).schema ?? "public";
    await runner.query(
      `CREATE TABLE "${schema}".users (id uuid PRIMARY KEY, email text NOT NULL UNIQUE, password_hash text NOT NULL, display_name text NOT NULL, role text NOT NULL CHECK (role IN ('CUSTOMER','SUPPORT','WAREHOUSE','ADMIN')), status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')), email_verified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`,
    );
    await runner.query(
      `CREATE TABLE "${schema}".auth_sessions (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES "${schema}".users(id) ON DELETE RESTRICT, token_family_id uuid NOT NULL, refresh_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`,
    );
    await runner.query(
      `CREATE INDEX auth_sessions_user_idx ON "${schema}".auth_sessions(user_id)`,
    );
    await runner.query(
      `CREATE INDEX auth_sessions_family_idx ON "${schema}".auth_sessions(token_family_id)`,
    );
    await runner.query(
      `CREATE TABLE "${schema}".refresh_token_history (id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES "${schema}".auth_sessions(id) ON DELETE RESTRICT, token_hash text NOT NULL UNIQUE, used_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL)`,
    );
    await runner.query(
      `CREATE TABLE "${schema}".verification_codes (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES "${schema}".users(id) ON DELETE RESTRICT, code_hash text NOT NULL, expires_at timestamptz NOT NULL, attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5), consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now())`,
    );
    await runner.query(
      `CREATE INDEX verification_codes_user_created_idx ON "${schema}".verification_codes(user_id,created_at DESC)`,
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    const schema =
      (runner.connection.options as { schema?: string }).schema ?? "public";
    await runner.query(
      `DROP TABLE "${schema}".verification_codes, "${schema}".refresh_token_history, "${schema}".auth_sessions, "${schema}".users`,
    );
  }
}
