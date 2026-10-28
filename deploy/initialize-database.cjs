const { Client } = require("pg");
const { randomBytes } = require("crypto");
const fs = require("fs");
async function main() {
  const master = process.env.POSTGRES_PASSWORD;
  if (!master) throw new Error("Bootstrap database password required");
  const client = new Client({
    host: "postgres",
    user: "shopfast",
    database: "shopfast",
    password: master,
  });
  await client.connect();
  try {
    const role = await client.query(
      "SELECT 1 FROM pg_roles WHERE rolname='shopfast_app'",
    );
    if (role.rowCount)
      throw new Error("App role exists; do not rotate credentials implicitly");
    const password = randomBytes(32).toString("hex");
    await client.query(
      `CREATE ROLE shopfast_app LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE`,
    );
    await client.query("GRANT CONNECT ON DATABASE shopfast TO shopfast_app");
    await client.query("GRANT USAGE ON SCHEMA public TO shopfast_app");
    await client.query(
      "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO shopfast_app",
    );
    await client.query(
      "GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO shopfast_app",
    );
    await client.query(
      "ALTER DEFAULT PRIVILEGES FOR ROLE shopfast IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO shopfast_app",
    );
    await client.query(
      "ALTER DEFAULT PRIVILEGES FOR ROLE shopfast IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO shopfast_app",
    );
    fs.appendFileSync(
      "/config/app.env",
      `DATABASE_URL=postgresql://shopfast_app:${password}@postgres:5432/shopfast\n`,
      { mode: 0o600 },
    );
    console.log("Least-privilege app database role initialized");
  } finally {
    await client.end();
  }
}
main().catch(() => {
  console.error("Database initialization failed; credentials not logged");
  process.exitCode = 1;
});
