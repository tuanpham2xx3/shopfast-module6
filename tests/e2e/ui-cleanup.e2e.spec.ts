import { expect, test } from "@playwright/test";

test("customer views stay focused and translated filters keep API enum values", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let filter = "";
  const order = {
    id: "o1",
    code: "ORDER-DEMO",
    status: "PENDING_PAYMENT",
    paymentStatus: "UNPAID",
    total: 250000,
    version: 1,
    items: [],
    history: [],
  };
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let data: unknown = {};
    if (path.endsWith("/auth/refresh"))
      data = {
        accessToken: "fixture-token",
        user: {
          id: "customer-ui",
          displayName: "UI Customer",
          role: "CUSTOMER",
          verified: true,
        },
      };
    else if (path.endsWith("/cart"))
      data = {
        items: [
          {
            productId: "p1",
            name: "Micro demo",
            price: 250000,
            quantity: 1,
            available: 5,
            active: true,
          },
        ],
      };
    else if (path.endsWith("/orders/o1")) data = order;
    else if (path.endsWith("/orders")) {
      filter = url.searchParams.get("status") ?? "";
      data = { items: [order], total: 1 };
    } else if (path.endsWith("/tickets")) data = { items: [], total: 0 };
    await route.fulfill({ json: { data } });
  });
  await page.goto("/checkout");
  await expect(
    page.getByRole("heading", { name: "Thanh toán", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Lọc đơn theo trạng thái", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Đơn hàng", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Lọc đơn theo trạng thái", exact: true })
    .selectOption({ label: "Chờ thanh toán" });
  await expect.poll(() => filter).toBe("PENDING_PAYMENT");
  await page.getByRole("button").filter({ hasText: "ORDER-DEMO" }).click();
  await expect(page.getByLabel("Chi tiết đơn hàng")).toContainText(
    "Chờ thanh toán",
  );
  await expect(
    page.getByRole("button", {
      name: "Xác nhận thanh toán mô phỏng",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Lọc đơn theo trạng thái", { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("order-clean-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Hỗ trợ", exact: true }).click();
  await expect(page.getByLabel("Tiêu đề", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Tạo yêu cầu", exact: true }).click();
  await expect(page.getByLabel("Tiêu đề", { exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Hủy", exact: true }).click();
  await expect(page.getByLabel("Tiêu đề", { exact: true })).toHaveCount(0);
});

for (const width of [1280, 390]) {
  test(`compact operations summary at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      let data: unknown = {};
      if (path.endsWith("/auth/refresh"))
        data = {
          accessToken: "fixture-token",
          user: {
            id: "admin-ui",
            displayName: "UI Admin",
            email: "ui@example.test",
            role: "ADMIN",
            verified: true,
          },
        };
      else if (path.endsWith("/categories") || path.endsWith("/brands"))
        data = [];
      else if (path.endsWith("/products") || path.endsWith("/failed-jobs"))
        data = { items: [] };
      else if (path.endsWith("/admin/health"))
        data = { database: "ok", redis: "ok", gemini: { status: "CLOSED" } };
      else if (path.endsWith("/admin/queues"))
        data = {
          redisQueue: {
            status: "ok",
            counts: {
              waiting: 3,
              active: 2,
              completed: 21,
              failed: 1,
              delayed: 4,
            },
          },
        };
      await route.fulfill({ json: { data } });
    });
    await page.goto("/admin/operations");
    await expect(page.getByLabel("Tình trạng dịch vụ")).toContainText(
      "Chưa kiểm tra",
    );
    await expect(page.locator("pre:visible")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Kiểm tra dịch vụ và queue", exact: true })
      .click();
    const counts = page.getByLabel("Số lượng tác vụ");
    await expect(
      counts.getByText("Đang chờ", { exact: true }).locator(".."),
    ).toContainText("3");
    await expect(
      counts.getByText("Đang chạy", { exact: true }).locator(".."),
    ).toContainText("2");
    await expect(
      counts.getByText("Hoàn tất", { exact: true }).locator(".."),
    ).toContainText("21");
    await expect(
      page.getByText("Không có tác vụ lỗi.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/chưa xác minh phản hồi/)).toBeVisible();
    await expect(page.locator("pre:visible")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`operations-clean-${width}.png`),
      fullPage: true,
    });
    await page.getByText("Chi tiết kỹ thuật", { exact: true }).click();
    await expect(page.locator("pre:visible")).toHaveCount(2);
    await expect(page.locator("pre").last()).toContainText('"redisQueue"');
  });
}

test("failed operations checks stay unavailable instead of showing empty success", async ({
  page,
}) => {
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/refresh"))
      await route.fulfill({
        json: {
          data: {
            accessToken: "fixture-token",
            user: {
              id: "a",
              displayName: "Admin",
              role: "ADMIN",
              verified: true,
            },
          },
        },
      });
    else if (path.includes("/admin/"))
      await route.fulfill({
        status: 503,
        json: {
          error: { code: "UNAVAILABLE", message: "Không thể kết nối dịch vụ" },
        },
      });
    else
      await route.fulfill({
        json: { data: path.endsWith("/products") ? { items: [] } : [] },
      });
  });
  await page.goto("/admin/operations");
  await page
    .getByRole("button", { name: "Kiểm tra dịch vụ và queue", exact: true })
    .click();
  await expect(
    page
      .getByLabel("Tình trạng dịch vụ")
      .getByText("Không sẵn sàng", { exact: true }),
  ).toHaveCount(3);
  await expect(
    page.getByText("Không có tác vụ lỗi.", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Số lượng tác vụ").getByText("—", { exact: true }),
  ).toHaveCount(5);
});

test("mobile storefront keeps filters collapsible and removes repeated metadata", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/refresh")) {
      await route.fulfill({
        status: 401,
        json: { error: { message: "Unauthorized" } },
      });
      return;
    }
    const product = {
      id: "p",
      name: "Micro demo",
      sku: "SKU-HIDDEN",
      price: 250000,
      available: 7,
      imageUrl: "",
      brand: { name: "Demo" },
      category: { name: "Audio" },
    };
    await route.fulfill({
      json: {
        data: path.endsWith("/products") ? { items: [product], total: 1 } : [],
      },
    });
  });
  await page.goto("/login");
  await expect(page.locator(".intro")).toHaveCount(0);
  await expect(page.getByLabel("Mật khẩu", { exact: true })).toBeInViewport();
  await page.screenshot({
    path: info.outputPath("auth-clean-mobile.png"),
    fullPage: true,
  });
  await page.goto("/");
  await expect(page).toHaveURL(/\/products$/);
  await expect(page.getByLabel("Giá từ", { exact: true })).not.toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Phân trang", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("SKU-HIDDEN", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Nguồn ảnh", exact: true }),
  ).toHaveCount(1);
  await page.getByText("Bộ lọc và sắp xếp", { exact: true }).click();
  await page.getByLabel("Giá từ", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Lọc", exact: true }).click();
  await expect(page).toHaveURL(/minPrice=100/);
  await expect(page.getByLabel("Giá từ", { exact: true })).not.toBeVisible();
  await page.screenshot({
    path: info.outputPath("store-clean-mobile.png"),
    fullPage: true,
  });
});
