import { expect, test } from "@playwright/test";
import { createDataSource } from "../../libs/platform/src/database/data-source";

test("real browser registers, verifies, creates catalog and adjusts stock", async ({
  page,
  request,
}) => {
  test.skip(
    !process.env.TEST_DATABASE_URL,
    "Requires native PostgreSQL or CI PostgreSQL service",
  );
  const schema = process.env.E2E_SCHEMA!;
  const source = await createDataSource(
    process.env.TEST_DATABASE_URL!,
    schema,
  ).initialize();
  const email = `browser-${Date.now()}@example.test`;
  try {
    await page.goto("/");
    await page.getByLabel("Họ tên").fill("Browser Admin");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Mật khẩu").fill("BrowserPassword!2026");
    await page
      .getByRole("button", { name: "Tạo tài khoản", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Xác minh email" }),
    ).toBeVisible();
    const [event] = await source.query(
      `SELECT payload FROM "${schema}".outbox_events WHERE payload->>'recipient'=$1`,
      [email],
    );
    await page.getByLabel("Mã xác minh").fill(event.payload.code);
    await page.getByRole("button", { name: "Xác minh", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Chào Browser Admin" }),
    ).toBeVisible();
    await source.query(
      `UPDATE "${schema}".users SET role='ADMIN' WHERE email=$1`,
      [email],
    );
    const login = await request.post(
      "http://127.0.0.1:4300/api/v1/auth/login",
      { data: { email, password: "BrowserPassword!2026" } },
    );
    expect(login.ok()).toBeTruthy();
    const auth = {
      Authorization: `Bearer ${(await login.json()).data.accessToken}`,
    };
    const base = "http://127.0.0.1:4300/api/v1";
    const category = await request.post(`${base}/admin/categories`, {
      headers: auth,
      data: { name: "Audio", slug: `audio-${Date.now()}` },
    });
    const brand = await request.post(`${base}/admin/brands`, {
      headers: auth,
      data: { name: "Demo", slug: `demo-${Date.now()}` },
    });
    const product = await request.post(`${base}/admin/products`, {
      headers: auth,
      data: {
        sku: `LIVE-${Date.now()}`,
        slug: `live-${Date.now()}`,
        name: "Live headphones",
        description: "Real database product",
        imageUrl: "https://example.com/demo.jpg",
        categoryId: (await category.json()).data.id,
        brandId: (await brand.json()).data.id,
        price: 250000,
      },
    });
    expect(product.ok()).toBeTruthy();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Chào Browser Admin" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Khám phá sản phẩm" }).click();
    await expect(
      page.getByRole("heading", { name: "Live headphones", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Thay đổi").fill("7");
    await page.getByLabel("Lý do").fill("Browser initial stock");
    await page.getByRole("button", { name: "Lưu điều chỉnh" }).click();
    await expect(
      page.getByText("Còn 7 sản phẩm", { exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("heading", { name: "Live headphones", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  } finally {
    await source.destroy();
  }
});
