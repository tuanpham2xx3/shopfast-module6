process.env.DATABASE_URL = `postgresql://shopfast:${process.env.POSTGRES_PASSWORD}@postgres:5432/shopfast`;
// One-shot synthetic demo seed: never run development mode for serving API/worker.
process.env.NODE_ENV = "development";
require("/app/dist-tools/database/seeds/development.js");
