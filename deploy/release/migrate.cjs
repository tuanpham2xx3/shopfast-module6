process.env.DATABASE_URL = `postgresql://shopfast:${process.env.POSTGRES_PASSWORD}@postgres:5432/shopfast`;
require("/app/dist-tools/BE/database/migrate.js");
