import "dotenv/config";
import { randomUUID } from "node:crypto";
import * as argon2 from "argon2";
import { createDataSource } from "../../libs/platform/src/database/data-source";
import { CatalogService } from "../../libs/modules/catalog/src/catalog.service";

async function main() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Development seed is disabled in production");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const source = await createDataSource(process.env.DATABASE_URL).initialize();
  try {
    const password = process.env.DEV_SEED_PASSWORD;
    if (!password || password.length < 10 || password.length > 128)
      throw new Error("DEV_SEED_PASSWORD must contain 10–128 characters");
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await source.transaction(async (manager) => {
      for (const role of ["CUSTOMER", "WAREHOUSE", "SUPPORT", "ADMIN"]) {
        await manager.query(
          `INSERT INTO users (id,email,password_hash,display_name,role,email_verified_at) VALUES ($1,$2,$3,$4,$5,now()) ON CONFLICT(email) DO NOTHING`,
          [
            randomUUID(),
            `${role.toLowerCase()}@shopfast.test`,
            passwordHash,
            `Demo ${role}`,
            role,
          ],
        );
      }
      const [category] = await manager.query(
        `INSERT INTO categories (id,name,slug) VALUES ($1,'Âm thanh','am-thanh') ON CONFLICT(slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id`,
        [randomUUID()],
      );
      const [brand] = await manager.query(
        `INSERT INTO brands (id,name,slug) VALUES ($1,'ShopFast Studio','shopfast-studio') ON CONFLICT(slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id`,
        [randomUUID()],
      );
      for (const [index, name, price] of [
        [1, "Tai nghe Studio", 490000],
        [2, "Loa Mini", 790000],
        [3, "Micro USB", 990000],
      ] as const) {
        const [product] = await manager.query(
          `INSERT INTO products (id,sku,slug,name,description,image_url,category_id,brand_id,price) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(sku) DO NOTHING RETURNING id`,
          [
            randomUUID(),
            `SF-AUDIO-${index}`,
            `studio-audio-${index}`,
            name,
            "Sản phẩm giả lập phục vụ kiểm thử và trình diễn ShopFast.",
            "https://example.com/product.jpg",
            category.id,
            brand.id,
            price,
          ],
        );
        if (product) {
          await manager.query(
            `INSERT INTO inventories(product_id) VALUES ($1)`,
            [product.id],
          );
        }
      }
    });
    const catalog = new CatalogService(source);
    const [admin] = await source.query(
      `SELECT id FROM users WHERE email='admin@shopfast.test'`,
    );
    for (const item of (await catalog.inventory({ pageSize: 100 })).items) {
      if (
        item.version === 1 &&
        item.onHand === 0 &&
        item.sku.startsWith("SF-AUDIO-")
      )
        await catalog.adjust(
          item.productId,
          admin.id,
          `seed-stock-${item.sku}`,
          {
            delta: 20,
            reason: "Initial development seed stock",
            expectedVersion: 1,
          },
        );
    }
    await source.query(
      `INSERT INTO outbox_events (id,business_key,type,aggregate_id,aggregate_version,payload) VALUES ($1,$2,$3,$4,1,$5) ON CONFLICT (business_key) DO NOTHING`,
      [
        randomUUID(),
        "dev-foundation-email-v1",
        "foundation.email",
        randomUUID(),
        JSON.stringify({ template: "foundation-smoke" }),
      ],
    );
    console.log("Development outbox seed ready");
  } finally {
    await source.destroy();
  }
}
void main().catch(() => {
  console.error("Seed failed; verify environment and run migrations first");
  process.exitCode = 1;
});
