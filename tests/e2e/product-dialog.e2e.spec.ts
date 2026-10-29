import { expect, test } from "@playwright/test";
for (const width of [1280, 390]) {
  test(`product popup and navigation cart at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    let quantity = 0;
    let orderReads = 0;
    let cartGate: Promise<void> | undefined;
    let releaseCart: (() => void) | undefined;
    let blockedReads = 0;
    const product = {
      id: "product-1",
      name: "Micro USB",
      sku: "MICRO-USB",
      price: 250000,
      available: 7,
      description: "Micro thu âm USB cho cuộc gọi và ghi âm.",
      imageUrl: "",
      category: { name: "Âm thanh" },
      brand: { name: "ShopFast" },
    };
    await page.route("**/api/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname.split("/api/v1")[1];
      let data: unknown = {};
      if (path === "/auth/refresh")
        data = {
          accessToken: "synthetic-token",
          user: {
            id: "customer-1",
            email: "popup@example.test",
            displayName: "Popup Customer",
            role: "CUSTOMER",
            verified: true,
          },
        };
      else if (path === "/categories" || path === "/brands") data = [];
      else if (path === "/products") data = { items: [product], total: 1 };
      else if (path === "/products/product-1") data = product;
      else if (path === "/cart/items" && route.request().method() === "POST")
        quantity++;
      else if (path === "/cart/items/product-1") {
        if (route.request().method() === "DELETE") quantity = 0;
        else quantity = route.request().postDataJSON().quantity;
      } else if (path === "/cart") {
        if (cartGate) {
          blockedReads++;
          await cartGate;
        }
        data = {
          items: quantity
            ? [
                {
                  productId: product.id,
                  name: product.name,
                  quantity,
                  price: product.price,
                  available: 7,
                  active: true,
                },
              ]
            : [],
        };
      } else if (path?.startsWith("/orders")) {
        orderReads++;
        data = { items: [], total: 0 };
      }
      await route.fulfill({ json: { data } });
    });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Chào Popup Customer" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cửa hàng", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Đơn hàng của bạn", exact: true }),
    ).toHaveCount(0);
    const trigger = page.getByRole("button", {
      name: "Xem Micro USB",
      exact: true,
    });
    await trigger.click();
    const popup = page.getByRole("dialog", { name: "Micro USB" });
    await expect(popup).toBeVisible();
    await expect(popup.getByText(product.description)).toBeVisible();
    await expect(popup.getByText("MICRO-USB", { exact: true })).toBeVisible();
    await expect(popup.getByText("250.000 ₫", { exact: true })).toBeVisible();
    await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
    await expect(
      popup.getByRole("button", { name: "Đóng chi tiết" }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(
      popup.getByRole("button", { name: "Đóng chi tiết" }),
    ).toBeFocused();
    await page.screenshot({
      path: testInfo.outputPath(`product-popup-${width}.png`),
    });
    await page.keyboard.press("Escape");
    await expect(popup).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
    await trigger.click();
    await popup.getByRole("button", { name: "Đóng chi tiết" }).click();
    await expect(popup).toHaveCount(0);
    await trigger.click();
    await expect(popup).toBeVisible();
    await page.mouse.click(2, 2);
    await expect(popup).toHaveCount(0);
    await expect(page.getByLabel("Người nhận")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Thêm Micro USB vào giỏ", exact: true })
      .click();
    const cart = page.getByRole("button", {
      name: "Giỏ hàng, 1 sản phẩm",
      exact: true,
    });
    await expect(cart).toBeVisible();
    expect(orderReads).toBe(0);
    await cart.click();
    const quickCart = page.getByRole("region", { name: "Giỏ hàng nhanh" });
    await expect(quickCart).toBeVisible();
    await expect(page.getByLabel("Người nhận")).toHaveCount(0);
    await expect(
      quickCart.getByText("Micro USB", { exact: true }),
    ).toBeVisible();
    cartGate = new Promise<void>((resolve) => {
      releaseCart = resolve;
    });
    const productNode = await quickCart
      .getByText("Micro USB", { exact: true })
      .elementHandle();
    const cardNode = await page
      .locator(".product-card")
      .first()
      .elementHandle();
    await quickCart
      .getByRole("button", { name: "Tăng số lượng Micro USB" })
      .click();
    await expect.poll(() => blockedReads).toBeGreaterThanOrEqual(2);
    await expect(
      quickCart.getByRole("button", { name: "Tăng số lượng Micro USB" }),
    ).toHaveCSS("cursor", "pointer");
    await expect(
      quickCart.getByText("Đang cập nhật giỏ hàng…", { exact: true }),
    ).toBeVisible();
    await expect(
      quickCart.getByText("Micro USB", { exact: true }),
    ).toBeVisible();
    await expect(quickCart.getByText("Đang tải giỏ hàng…")).toHaveCount(0);
    await expect(
      quickCart.getByRole("button", { name: "Tiến hành thanh toán" }),
    ).toBeVisible();
    await expect(cart).toBeVisible();
    expect(await productNode!.evaluate((node) => node.isConnected)).toBe(true);
    expect(await cardNode!.evaluate((node) => node.isConnected)).toBe(true);
    cartGate = undefined;
    releaseCart!();
    await expect(
      page.getByRole("button", { name: "Giỏ hàng, 2 sản phẩm", exact: true }),
    ).toBeVisible();
    await expect(
      quickCart.getByText("500.000 ₫", { exact: true }).last(),
    ).toBeVisible();
    await expect(
      quickCart.getByRole("button", { name: "Tăng số lượng Micro USB" }),
    ).toBeFocused();
    await quickCart
      .getByRole("button", { name: "Giảm số lượng Micro USB" })
      .click();
    await expect(cart).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`cart-dropdown-${width}.png`),
    });
    await page.keyboard.press("Escape");
    await expect(quickCart).toHaveCount(0);
    await expect(cart).toBeFocused();
    await cart.click();
    await page.locator(".brand").click();
    await expect(quickCart).toHaveCount(0);
    await cart.click();
    await quickCart
      .getByRole("button", { name: "Tiến hành thanh toán" })
      .click();
    await expect(page.getByLabel("Người nhận")).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Phân trang đơn hàng" }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Số lượng Micro USB")).toHaveValue("1");
    await page.getByLabel("Số lượng Micro USB").fill("2");
    await page.getByLabel("Người nhận").click();
    await expect(
      page.getByRole("button", { name: "Giỏ hàng, 2 sản phẩm", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Xóa Micro USB", exact: true })
      .click();
    await expect(
      page.getByText("Giỏ hàng đang trống.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Giỏ hàng, 0 sản phẩm", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
