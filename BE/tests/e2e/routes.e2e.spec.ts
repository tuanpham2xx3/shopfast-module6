import { expect, Page, test } from "@playwright/test";

async function fixture(
  page: Page,
  role: string | null = "CUSTOMER",
  verified = true,
  restoreGate?: Promise<void>,
) {
  let user = role
    ? {
        id: "u1",
        email: "routes@example.test",
        displayName: "Route Demo",
        role,
        verified,
      }
    : null;
  const product = {
    id: "p1",
    name: "Route Micro",
    sku: "ROUTE-1",
    price: 250000,
    available: 5,
    description: "Sản phẩm theo URL",
    imageUrl: "",
    brand: { name: "Demo" },
    category: { name: "Demo" },
  };
  const order = {
    id: "o1",
    code: "ORDER-URL",
    status: "DELIVERED",
    paymentStatus: "PAID",
    total: 250000,
    version: 1,
    items: [],
    history: [],
  };
  const ticket = {
    id: "t1",
    subject: "Ticket theo URL",
    body: "Nội dung hỗ trợ",
    status: "OPEN",
    category: "OTHER",
    assignedTo: null,
    version: 1,
    messages: { items: [] },
  };
  const requests: string[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const path =
      new URL(route.request().url()).pathname.split("/api/v1")[1] ?? "";
    requests.push(path);
    let data: unknown = {};
    if (path === "/auth/refresh") {
      await restoreGate;
      if (!user) {
        await route.fulfill({
          status: 401,
          json: { error: { code: "UNAUTHORIZED", message: "Chưa đăng nhập" } },
        });
        return;
      }
      data = { accessToken: "fixture-token", user };
    } else if (path === "/auth/login") {
      user = {
        id: "u1",
        email: "routes@example.test",
        displayName: "Route Demo",
        role: "CUSTOMER",
        verified: true,
      };
      data = { accessToken: "fixture-token", user };
    } else if (path === "/auth/verification/confirm") {
      user = { ...user!, verified: true };
      data = user;
    } else if (path === "/categories" || path === "/brands") data = [];
    else if (path === "/products") data = { items: [product], total: 1 };
    else if (path === "/products/p1") data = product;
    else if (path.startsWith("/products/")) {
      await route.fulfill({
        status: 404,
        json: {
          error: { code: "NOT_FOUND", message: "Không tìm thấy sản phẩm" },
        },
      });
      return;
    } else if (path === "/cart" || path === "/staff/inventory")
      data = { items: [] };
    else if (path === "/orders/o1" || path === "/staff/orders/o1") data = order;
    else if (path === "/orders" || path === "/staff/orders")
      data = { items: [order], total: 1 };
    else if (path === "/tickets/t1" || path === "/staff/tickets/t1")
      data = ticket;
    else if (path === "/tickets" || path === "/staff/tickets")
      data = { items: [ticket], total: 1 };
    await route.fulfill({ json: { data } });
  });
  return requests;
}

test("catalog URL, popup refresh, Back/Forward and filters", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/products?minPrice=100&sort=price_asc");
  await expect(page.getByLabel("Giá từ", { exact: true })).toHaveValue("100");
  await page
    .getByRole("button", { name: "Xem Route Micro", exact: true })
    .click();
  await expect(page).toHaveURL(/\/products\/p1\?minPrice=100&sort=price_asc$/);
  await expect(page.getByRole("dialog", { name: "Route Micro" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Route Micro" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/products\?minPrice=100&sort=price_asc$/);
  await page.goForward();
  await expect(page.getByRole("dialog", { name: "Route Micro" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Giá từ", { exact: true }).fill("200");
  await page.getByRole("button", { name: "Lọc", exact: true }).click();
  await expect(page).toHaveURL(/minPrice=200/);
  await page.reload();
  await expect(page.getByLabel("Giá từ", { exact: true })).toHaveValue("200");
});

test("private deep link waits for restoration, survives reload and history", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requests = await fixture(page, "CUSTOMER", true, gate);
  await page.goto("/orders/o1");
  await expect(
    page.getByRole("heading", { name: "Đang khôi phục phiên…" }),
  ).toBeVisible();
  expect(requests.filter((path) => path.startsWith("/orders"))).toHaveLength(0);
  release();
  await expect(page.getByLabel("Chi tiết đơn hàng")).toContainText("ORDER-URL");
  await page.reload();
  await expect(page).toHaveURL(/\/orders\/o1$/);
  await expect(page.getByLabel("Chi tiết đơn hàng")).toContainText("ORDER-URL");
  await page.getByRole("button", { name: "Cửa hàng", exact: true }).click();
  await page.goBack();
  await expect(page.getByLabel("Chi tiết đơn hàng")).toContainText("ORDER-URL");
});

test("guest returns to requested order after login; external next is rejected", async ({
  page,
}) => {
  await fixture(page, null);
  await page.goto("/orders/o1");
  await expect(page).toHaveURL(/\/login\?next=%2Forders%2Fo1$/);
  await page.getByLabel("Email", { exact: true }).fill("routes@example.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("RoutePassword123!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/orders\/o1$/);
  await expect(page.getByLabel("Chi tiết đơn hàng")).toContainText("ORDER-URL");
  await page.goto("/login?next=https%3A%2F%2Fevil.example");
  await page.getByLabel("Email", { exact: true }).fill("routes@example.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("RoutePassword123!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
});

test("unverified customer returns to checkout after verification", async ({
  page,
}) => {
  await fixture(page, "CUSTOMER", false);
  await page.goto("/checkout");
  await expect(page).toHaveURL(/\/verify-email\?next=%2Fcheckout$/);
  await page.getByLabel("Mã xác minh", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Xác minh", exact: true }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(
    page.getByText("Giỏ hàng đang trống.", { exact: true }),
  ).toBeVisible();
});

test("wrong role renders 403 without protected API calls; unknown route is 404", async ({
  page,
}) => {
  const requests = await fixture(page);
  await page.goto("/staff/inventory");
  await expect(page.getByRole("heading", { name: /403/ })).toBeVisible();
  expect(requests).not.toContain("/staff/inventory");
  await page.goto("/admin/operations");
  await expect(page.getByRole("heading", { name: /403/ })).toBeVisible();
  expect(requests.some((path) => path.startsWith("/admin/"))).toBe(false);
  await page.goto("/missing-page");
  await expect(page.getByRole("heading", { name: /404/ })).toBeVisible();
  await page.goto("/products/missing");
  await expect(page.getByRole("alert")).toContainText(
    "Không tìm thấy sản phẩm",
  );
});

for (const role of ["CUSTOMER", "WAREHOUSE", "SUPPORT", "ADMIN"]) {
  test(`${role} direct workspace routes`, async ({ page }) => {
    await fixture(page, role);
    const prefix = ["SUPPORT", "ADMIN"].includes(role)
      ? "/staff/tickets"
      : "/tickets";
    await page.goto(`${prefix}/t1`);
    await expect(
      page.getByRole("heading", { name: "Ticket theo URL", exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Ticket theo URL", exact: true }),
    ).toBeVisible();
    if (["WAREHOUSE", "ADMIN"].includes(role)) {
      await page.goto("/staff/inventory");
      await expect(
        page.getByRole("heading", { name: "Điều chỉnh tồn kho", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Khám phá sản phẩm", exact: true }),
      ).toHaveCount(0);
      await page.goto("/staff/orders/o1");
      await expect(page.getByLabel("Chi tiết đơn hàng")).toContainText(
        "ORDER-URL",
      );
    }
    if (role === "ADMIN") {
      await page.goto("/admin/promotions");
      await expect(
        page.getByRole("heading", { name: "Tạo khuyến mãi", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Sản phẩm", exact: true }),
      ).toHaveCount(0);
      await page.getByRole("link", { name: "Vận hành", exact: true }).click();
      await expect(page).toHaveURL(/\/admin\/operations$/);
      await expect(
        page.getByRole("button", {
          name: "Kiểm tra dịch vụ và queue",
          exact: true,
        }),
      ).toBeVisible();
    }
  });
}
