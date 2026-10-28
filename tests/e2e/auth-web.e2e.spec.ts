import { expect, test } from "@playwright/test";

const user = {
  id: "customer-1",
  email: "browser@example.test",
  displayName: "Nguyễn Demo",
  role: "CUSTOMER",
  verified: false,
};

test("preserves password input and theme preference on mobile", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/refresh", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "Unauthorized" } }),
    }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const password = page.getByLabel("Mật khẩu", { exact: true });
  await password.fill("SyntheticUiPassword!2026");
  await page
    .getByRole("button", { name: "Hiện mật khẩu", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(password).toHaveValue("SyntheticUiPassword!2026");
  await page
    .getByRole("button", { name: "Đã có tài khoản? Đăng nhập", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "password");
  await page.route("**/api/v1/auth/login", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        error: { message: "Email hoặc mật khẩu không đúng" },
      }),
    }),
  );
  await page.getByLabel("Email", { exact: true }).fill("invalid@example.test");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Email hoặc mật khẩu không đúng",
  );
  await page
    .getByRole("button", { name: "Hiện mật khẩu", exact: true })
    .click();
  await page.getByRole("button", { name: "Ẩn mật khẩu", exact: true }).click();
  await expect(password).toHaveAttribute("type", "password");
  await page
    .getByRole("button", { name: "Chuyển sang giao diện tối", exact: true })
    .click();
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .getByRole("button", { name: "Đăng nhập", exact: true })
      .evaluate((element) => getComputedStyle(element).transitionDuration),
  ).toBe("0s");
});

test("registers, verifies and shows the current account", async ({ page }) => {
  await page.route("**/api/v1/auth/refresh", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "Unauthorized" } }),
    }),
  );
  await page.route("**/api/v1/auth/register", (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          accessToken: "access-token",
          expiresIn: 900,
          user,
          verificationRequired: true,
        },
      }),
    }),
  );
  await page.route("**/api/v1/auth/verification/confirm", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { ...user, verified: true } }),
    }),
  );

  await page.goto("/");
  await page.getByLabel("Họ tên").fill("Nguyễn Demo");
  await page.getByLabel("Email").fill("browser@example.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("TestPassword!2026");
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();

  await expect(
    page.getByRole("heading", { name: "Xác minh email" }),
  ).toBeVisible();
  await page.getByLabel("Mã xác minh").fill("123456");
  await page.getByRole("button", { name: "Xác minh" }).click();

  await expect(
    page.getByRole("heading", { name: "Chào Nguyễn Demo" }),
  ).toBeVisible();
  await expect(page.getByText("Đã xác minh")).toBeVisible();
});
