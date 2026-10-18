import "reflect-metadata";
import { DataSource } from "typeorm";
import { Foundation1780000000000 } from "../../../../database/migrations/1780000000000-foundation";
import { Auth1780000100000 } from "../../../../database/migrations/1780000100000-auth";

export function createDataSource(url: string, schema = "public"): DataSource {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema))
    throw new Error("Invalid database schema");
  return new DataSource({
    type: "postgres",
    url,
    schema,
    synchronize: false,
    logging: false,
    migrations: [Foundation1780000000000, Auth1780000100000],
    migrationsTransactionMode: "all",
    connectTimeoutMS: 3000,
    extra: { max: 5, statement_timeout: 5000 },
  });
}
