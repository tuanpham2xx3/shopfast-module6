import { expect, Page, test } from "@playwright/test";

const orderId = "1e496527-f1b3-440b-b086-59180a963b39";
const ticketId = "269e8582-f008-47a9-acf1-7348bb98bbf3";
const user = {
  id: "customer-ticket-test",
  email: "ticket-browser@example.test",
  displayName: "Ticket Demo",
  role: "CUSTOMER",
  verified: true,
};

async function fixture(page: Page, expireOnCreate = false) {
  const submitted: { body: Record<string, unknown>; authorization: string }[] =
    [];
  let refreshes = 0;
  let created: Record<string, unknown> | null = null;
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.split("/api/v1")[1];
    let data: unknown = {};
    if (path === "/auth/refresh") {
      refreshes++;
      data = {
        accessToken: refreshes === 1 ? "initial-token" : "renewed-token",
        user,
      };
    } else if (path === "/orders") {
      data = {
        items: [{ id: orderId, code: "SF20261102DEMO01", status: "DELIVERED" }],
        total: 1,
      };
    } else if (path === "/tickets" && request.method() === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      submitted.push({
        body,
        authorization: request.headers().authorization ?? "",
      });
      if (expireOnCreate && submitted.length === 1) {
        await route.fulfill({
          status: 401,
          json: {
            error: {
              code: "INVALID_ACCESS_TOKEN",
              message: "Phiên đăng nhập đã hết hạn.",
            },
          },
        });
        return;
      }
      created = {
        ...body,
        id: ticketId,
        status: "OPEN",
        category: "OTHER",
        version: 1,
        assignedTo: null,
        messages: { items: [] },
      };
      await route.fulfill({ status: 201, json: { data: created } });
      return;
    } else if (path === "/tickets") {
      data = { items: created ? [created] : [], total: created ? 1 : 0 };
    } else if (path === `/tickets/${ticketId}`) data = created;
    else if (path === "/cart") data = { items: [] };
    else if (path === "/categories" || path === "/brands") data = [];
    else if (path === "/products") data = { items: [], total: 0 };
    await route.fulfill({ json: { data } });
  });
  await page.goto("/tickets");
  await page.getByRole("button", { name: "Tạo yêu cầu", exact: true }).click();
  await expect(page.locator('select[name="orderId"]')).toBeEnabled();
  return { submitted, refreshes: () => refreshes };
}

test("creates an unlinked ticket with trimmed fields and no empty order UUID", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.getByLabel("Tiêu đề", { exact: true }).fill("  Hỗ trợ mua hàng  ");
  await page
    .getByLabel("Nội dung", { exact: true })
    .fill("  Tôi cần tư vấn trước khi đặt hàng.  ");
  await page.getByRole("button", { name: "Gửi yêu cầu", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/tickets/${ticketId}$`));
  expect(f.submitted).toHaveLength(1);
  expect(f.submitted[0]!.body).toEqual({
    subject: "Hỗ trợ mua hàng",
    body: "Tôi cần tư vấn trước khi đặt hàng.",
  });
});

test("shows the customer's order code, submits its UUID, and restores an expired session once", async ({
  page,
}) => {
  const f = await fixture(page, true);
  const orders = page.locator('select[name="orderId"]');
  await expect(orders.locator("option").last()).toHaveText(
    "SF20261102DEMO01 · Đã giao",
  );
  await expect(
    page.getByText("ID đơn liên quan (tùy chọn)", { exact: true }),
  ).toHaveCount(0);
  await orders.selectOption(orderId);
  await page.getByLabel("Tiêu đề", { exact: true }).fill("Kiểm tra giao hàng");
  await page
    .getByLabel("Nội dung", { exact: true })
    .fill("Nhờ kiểm tra đơn này giúp tôi.");
  await page.getByRole("button", { name: "Gửi yêu cầu", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/tickets/${ticketId}$`));
  expect(f.submitted).toHaveLength(2);
  expect(f.submitted[0]!.body.orderId).toBe(orderId);
  expect(f.submitted[1]!.body).toEqual(f.submitted[0]!.body);
  expect(f.submitted[1]!.authorization).toBe("Bearer renewed-token");
  expect(f.refreshes()).toBe(2);
  await expect(
    page.getByRole("heading", { name: "Kiểm tra giao hàng", exact: true }),
  ).toBeVisible();
});

test("explains whitespace-only input without sending a failing create request", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.getByLabel("Tiêu đề", { exact: true }).fill("     ");
  await page.getByLabel("Nội dung", { exact: true }).fill("  ");
  await page.getByRole("button", { name: "Gửi yêu cầu", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Tiêu đề cần có từ 5 đến 150 ký tự",
  );
  expect(f.submitted).toHaveLength(0);
  await page.getByLabel("Tiêu đề", { exact: true }).fill("Yêu cầu hỗ trợ");
  await page.getByRole("button", { name: "Gửi yêu cầu", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "không chỉ gồm khoảng trắng",
  );
  expect(f.submitted).toHaveLength(0);
  await expect(page.getByLabel("Tiêu đề", { exact: true })).toHaveValue(
    "Yêu cầu hỗ trợ",
  );
});
