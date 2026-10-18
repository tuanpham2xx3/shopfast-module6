import { expect, test } from "@playwright/test";

const user = {
  id: "customer-1",
  email: "browser@example.test",
  displayName: "Nguyễn Demo",
  role: "CUSTOMER",
  verified: false,
};

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
  await page.getByLabel("Mật khẩu").fill("TestPassword!2026");
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
