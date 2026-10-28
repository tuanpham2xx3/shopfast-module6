import { expect, test } from "@playwright/test";
import { createDataSource } from "../../libs/platform/src/database/data-source";

test("UI-01 RT-04 real browser purchase, role operations and offline socket recovery", async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
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
    await page
      .getByLabel("Mật khẩu", { exact: true })
      .fill("BrowserPassword!2026");
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
    await page.goto("/account");
    await expect(
      page.getByRole("heading", { name: "Chào Browser Admin" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Khám phá sản phẩm" }).click();
    await expect(
      page.getByRole("heading", { name: "Live headphones", exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator(".product-card img")
          .first()
          .evaluate((image) => (image as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    await page.getByRole("button", { name: "Kho", exact: true }).click();
    await expect(page).toHaveURL(/\/staff\/inventory$/);
    await page.getByLabel("Thay đổi").fill("7");
    await page.getByLabel("Lý do").fill("Browser initial stock");
    await page.getByRole("button", { name: "Lưu điều chỉnh" }).click();
    await expect(page.getByText(/Tồn 7/)).toBeVisible();
    await page.getByRole("button", { name: "Cửa hàng", exact: true }).click();
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
    await source.query(
      `UPDATE "${schema}".users SET role='CUSTOMER' WHERE email=$1`,
      [email],
    );
    await page.goto("/account");
    await expect(
      page.getByRole("heading", { name: "Chào Browser Admin" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Khám phá sản phẩm" }).click();
    await page
      .getByRole("button", { name: "Thêm Live headphones vào giỏ" })
      .click();
    await page
      .getByRole("button", { name: "Giỏ hàng, 1 sản phẩm", exact: true })
      .click();
    await page.getByRole("button", { name: "Tiến hành thanh toán" }).click();
    await page.getByLabel("Người nhận").fill("Demo Buyer");
    await page.getByLabel("Địa chỉ nhận hàng").fill("123 Demo Street");
    await page.getByLabel("Số điện thoại").fill("0901234567");
    await page.getByLabel("Phường / Xã").fill("Demo Ward");
    await page.getByLabel("Tỉnh / Thành phố").fill("Demo City");
    const customerLogin = await request.post(`${base}/auth/login`, {
      data: { email, password: "BrowserPassword!2026" },
    });
    const customerAuth = {
      Authorization: `Bearer ${(await customerLogin.json()).data.accessToken}`,
      "Idempotency-Key": "invalid-array-address",
    };
    const malformed = await request.post(`${base}/orders`, {
      headers: customerAuth,
      data: {
        items: [
          {
            productId: (await product.json()).data.id,
            quantity: 1,
            expectedUnitPrice: 250000,
          },
        ],
        shippingAddress: [],
      },
    });
    expect(malformed.status()).toBe(400);
    await page
      .getByRole("button", { name: "Đặt đơn hàng", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Xác nhận thanh toán mô phỏng" }),
    ).toBeVisible();
    await page.getByLabel("Lý do hủy").fill("Reorder same purchase");
    await page
      .getByRole("button", { name: "Hủy đơn hàng", exact: true })
      .click();
    await expect(
      page
        .getByLabel("Chi tiết đơn hàng")
        .getByText("CANCELLED", { exact: true })
        .first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cửa hàng", exact: true }).click();
    await page
      .getByRole("button", { name: "Thêm Live headphones vào giỏ" })
      .click();
    await page
      .getByRole("button", { name: "Giỏ hàng, 1 sản phẩm", exact: true })
      .click();
    await page.getByRole("button", { name: "Tiến hành thanh toán" }).click();
    await page.getByLabel("Người nhận").fill("Demo Buyer");
    await page.getByLabel("Địa chỉ nhận hàng").fill("123 Demo Street");
    await page.getByLabel("Số điện thoại").fill("0901234567");
    await page.getByLabel("Phường / Xã").fill("Demo Ward");
    await page.getByLabel("Tỉnh / Thành phố").fill("Demo City");
    await page
      .getByRole("button", { name: "Đặt đơn hàng", exact: true })
      .click();
    await expect
      .poll(async () => {
        const [{ count }] = await source.query(
          `SELECT count(*)::int count FROM "${schema}".orders`,
        );
        return count;
      })
      .toBe(2);
    await page
      .getByRole("button", { name: "Xác nhận thanh toán mô phỏng" })
      .click();
    await expect(
      page
        .getByLabel("Chi tiết đơn hàng")
        .getByText("CONFIRMED", { exact: true })
        .first(),
    ).toBeVisible();
    // A separate warehouse identity changes the real order while the customer's
    // browser is offline. Reconnect must resubscribe and recover the missed state.
    const warehouseEmail = `reconnect-warehouse-${Date.now()}@example.test`;
    const warehouseRegistration = await request.post(`${base}/auth/register`, {
      data: {
        email: warehouseEmail,
        password: "BrowserWarehouse!2026",
        displayName: "Reconnect Warehouse",
      },
    });
    expect(warehouseRegistration.ok()).toBeTruthy();
    await source.query(
      `UPDATE "${schema}".users SET role='WAREHOUSE',email_verified_at=now() WHERE email=$1`,
      [warehouseEmail],
    );
    const warehouseLogin = await request.post(`${base}/auth/login`, {
      data: { email: warehouseEmail, password: "BrowserWarehouse!2026" },
    });
    expect(warehouseLogin.ok()).toBeTruthy();
    const warehouseAuth = {
      Authorization: `Bearer ${(await warehouseLogin.json()).data.accessToken}`,
    };
    const [trackedOrder] = await source.query(
      `SELECT id,version FROM "${schema}".orders WHERE status='CONFIRMED'`,
    );
    const detail = page.getByLabel("Chi tiết đơn hàng");
    await expect(
      detail.getByText("Đang theo dõi trực tiếp", { exact: true }),
    ).toBeVisible();
    await page.context().setOffline(true);
    // Chromium can retain an idle WebSocket until the heartbeat detects loss.
    await expect(
      detail.getByText("Mất kết nối; cập nhật mỗi 10 giây", { exact: true }),
    ).toBeVisible({ timeout: 50000 });
    const missedUpdate = await request.patch(
      `${base}/staff/orders/${trackedOrder.id}/status`,
      {
        headers: { ...warehouseAuth, "Idempotency-Key": "offline-processing" },
        data: {
          targetStatus: "PROCESSING",
          expectedVersion: trackedOrder.version,
        },
      },
    );
    expect(missedUpdate.ok()).toBeTruthy();
    await expect(
      detail.getByText("CONFIRMED", { exact: true }).first(),
    ).toBeVisible();
    await page.context().setOffline(false);
    await expect(
      detail.getByText("Đang theo dõi trực tiếp", { exact: true }),
    ).toBeVisible({ timeout: 40000 });
    await expect(
      detail.getByText("PROCESSING", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      detail.locator("ol li").filter({ hasText: "PROCESSING" }),
    ).toHaveCount(1);
    const onlineUpdate = await request.patch(
      `${base}/staff/orders/${trackedOrder.id}/status`,
      {
        headers: { ...warehouseAuth, "Idempotency-Key": "online-shipping" },
        data: {
          targetStatus: "SHIPPING",
          expectedVersion: (await missedUpdate.json()).data.version,
        },
      },
    );
    expect(onlineUpdate.ok()).toBeTruthy();
    await expect(
      detail.getByText("SHIPPING", { exact: true }).first(),
    ).toBeVisible({ timeout: 5000 });
    await expect(
      detail.locator("ol li").filter({ hasText: "PROCESSING" }),
    ).toHaveCount(1);
    await page.screenshot({
      path: "harness/reports/reconnect-recovered.png",
      fullPage: true,
    });
    await source.query(
      `UPDATE "${schema}".users SET role='WAREHOUSE' WHERE email=$1`,
      [email],
    );
    // This accelerated test reuses one synthetic account for every role. Respect
    // the conservative per-user fallback window instead of bypassing the limiter.
    await page.waitForTimeout(61000);
    await page.goto("/account");
    await expect(
      page.getByRole("heading", { name: "Chào Browser Admin" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Đơn hàng", exact: true }).click();
    await page.getByRole("button").filter({ hasText: "SHIPPING" }).click();
    for (const target of ["DELIVERED"]) {
      await page
        .getByRole("button", { name: `Chuyển sang ${target}`, exact: true })
        .click();
    }
    await expect(
      page
        .getByLabel("Chi tiết đơn hàng")
        .getByText("DELIVERED", { exact: true })
        .first(),
    ).toBeVisible();
    const [inventory] = await source.query(
      `SELECT on_hand,reserved FROM "${schema}".inventories`,
    );
    expect(inventory).toMatchObject({ on_hand: 6, reserved: 0 });
    await source.query(
      `UPDATE "${schema}".users SET role='CUSTOMER' WHERE email=$1`,
      [email],
    );
    await page.goto("/account");
    await expect(
      page.getByRole("heading", { name: "Chào Browser Admin" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Mở hỗ trợ", exact: true }).click();
    await page
      .getByLabel("Tiêu đề", { exact: true })
      .fill("Hỏi đơn hàng đã giao");
    await page
      .getByLabel("Nội dung", { exact: true })
      .fill("Tôi cần kiểm tra thông tin đơn hàng.");
    await page
      .getByRole("button", { name: "Gửi yêu cầu", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Hỏi đơn hàng đã giao", exact: true }),
    ).toBeVisible();
    await source.query(
      `UPDATE "${schema}".users SET role='SUPPORT' WHERE email=$1`,
      [email],
    );
    await page.goto("/account");
    await expect(
      page.getByRole("heading", { name: "Chào Browser Admin" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Mở hỗ trợ", exact: true }).click();
    await page
      .getByRole("button")
      .filter({ hasText: "Hỏi đơn hàng đã giao" })
      .click();
    await page.getByRole("button", { name: "Nhận xử lý", exact: true }).click();
    await page
      .getByLabel("Trả lời khách hàng", { exact: true })
      .fill("Đơn hàng đã giao thành công. Cảm ơn bạn.");
    await page
      .getByRole("button", { name: "Gửi tin nhắn", exact: true })
      .click();
    await expect(
      page.getByText("Đơn hàng đã giao thành công. Cảm ơn bạn.", {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByLabel("Hỏi trợ lý", { exact: true })
      .fill("Kiểm tra đơn hàng này");
    await page.getByRole("button", { name: "Hỏi Gemini", exact: true }).click();
    await expect(page.getByText("UNAVAILABLE", { exact: true })).toBeVisible();
    await page.screenshot({
      path: "harness/reports/support-ui-mobile.png",
      fullPage: true,
    });
    await source.query(
      `UPDATE "${schema}".users SET role='ADMIN' WHERE email=$1`,
      [email],
    );
    await page.goto("/account");
    await expect(
      page.getByRole("heading", { name: "Chào Browser Admin" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Mở quản trị", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Quản trị ShopFast", exact: true }),
    ).toBeVisible();
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    await page.getByRole("link", { name: "Vận hành", exact: true }).click();
    if (process.env.TEST_REDIS_URL) {
      const [queueResponse] = await Promise.all([
        page.waitForResponse((response) =>
          new URL(response.url()).pathname.endsWith("/admin/queues"),
        ),
        page
          .getByRole("button", {
            name: "Kiểm tra dịch vụ và queue",
            exact: true,
          })
          .click(),
      ]);
      expect(queueResponse.ok()).toBe(true);
      const queueSnapshot = (await queueResponse.json()).data.redisQueue;
      expect(queueSnapshot.status).toBe("ok");
      await test.info().attach("queue-counts", {
        body: JSON.stringify(queueSnapshot),
        contentType: "application/json",
      });
      for (const state of ["waiting", "active", "completed", "failed"]) {
        expect(queueSnapshot.counts[state]).toEqual(expect.any(Number));
        expect(queueSnapshot.counts[state]).toBeGreaterThanOrEqual(0);
      }
      await expect(
        page.locator("pre").filter({ hasText: "redisQueue" }),
      ).toContainText('"waiting"');
      await expect(
        page.locator("pre").filter({ hasText: "redisQueue" }),
      ).toContainText('"failed"');
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("link", { name: "Danh mục và sản phẩm", exact: true })
      .click();
    await expect(
      page
        .locator(".admin-grid article")
        .filter({ hasText: "Live headphones" }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: "harness/reports/ui-refresh-admin-mobile.png",
      fullPage: true,
      animations: "disabled",
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "harness/reports/ui-refresh-admin-desktop.png",
      fullPage: true,
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Chuyển sang giao diện tối", exact: true })
      .click();
    await page.screenshot({
      path: "harness/reports/ui-refresh-admin-dark.png",
      fullPage: true,
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await source.destroy();
  }
});
