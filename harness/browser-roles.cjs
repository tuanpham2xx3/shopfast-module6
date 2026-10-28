const { chromium, expect } = require("@playwright/test"),
  fs = require("fs"),
  dotenv = require("dotenv");
(async () => {
  const seed = dotenv.parse(fs.readFileSync(".secrets/deployment-seed.env"));
  const browser = await chromium.launch();
  const checks = [];
  try {
    for (const role of ["customer", "warehouse", "support", "admin"]) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", () => errors.push("UI exception"));
      page.on("response", (r) => {
        if (r.status() >= 500) errors.push("HTTP" + r.status());
      });
      await page.goto("https://shopfast.tuanpq.com");
      await page
        .getByRole("button", {
          name: "Đã có tài khoản? Đăng nhập",
          exact: true,
        })
        .click();
      await page
        .getByLabel("Email", { exact: true })
        .fill(
          role === "admin"
            ? seed.DEV_SEED_ADMIN_EMAIL
            : role + "@shopfast.test",
        );
      await page
        .getByLabel("Mật khẩu", { exact: true })
        .fill(seed.DEV_SEED_PASSWORD);
      await page
        .getByRole("button", { name: "Đăng nhập", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Đăng xuất", exact: true }),
      ).toBeVisible({ timeout: 15000 });
      if (role === "support") {
        await page
          .getByRole("button", { name: "Mở hỗ trợ", exact: true })
          .click();
        await expect(page.locator(".workspace-title")).toBeVisible();
      } else if (role === "admin") {
        await page
          .getByRole("button", { name: "Mở quản trị", exact: true })
          .click();
        await expect(
          page.getByRole("heading", { name: "Quản trị ShopFast", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("heading", {
            name: "Vận hành và tác vụ nền",
            exact: true,
          }),
        ).toBeVisible();
      } else {
        await page
          .getByRole("button", { name: "Khám phá sản phẩm", exact: true })
          .click();
        await expect(
          page.getByRole("heading", {
            name:
              role === "warehouse"
                ? "Xử lý đơn hàng"
                : "Giỏ hàng và đơn của bạn",
            exact: true,
          }),
        ).toBeVisible();
      }
      await page.screenshot({
        path: "harness/reports/role-" + role + ".png",
        fullPage: true,
      });
      if (errors.length) throw Error(role + " browser error");
      checks.push(role + " real login and workspace render");
      await context.close();
    }
    const report = {
      status: "PASS",
      executedAt: new Date().toISOString(),
      target: "https://shopfast.tuanpq.com",
      checks,
    };
    fs.writeFileSync(
      "harness/reports/role-browser-live.json",
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error("Production role browser check failed:", e.name);
  process.exitCode = 1;
});
