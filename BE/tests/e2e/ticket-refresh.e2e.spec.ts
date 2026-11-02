import { expect, test } from "@playwright/test";

test("support desk discovers new tickets without navigation or losing a reply draft", async ({
  page,
}) => {
  let published = false;
  const current = {
    id: "existing",
    subject: "Yêu cầu đang xử lý",
    body: "Nội dung khách hàng",
    status: "OPEN",
    category: "OTHER",
    version: 1,
    assignedTo: "support",
    messages: { items: [] },
  };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.split("/api/v1")[1];
    let data: unknown = {};
    if (path === "/auth/refresh")
      data = {
        accessToken: "ticket-refresh-token",
        user: {
          id: "support",
          email: "support@example.test",
          displayName: "Support",
          role: "SUPPORT",
          verified: true,
        },
      };
    else if (path === "/staff/tickets")
      data = {
        items: published
          ? [
              { ...current, id: "new", subject: "Yêu cầu mới từ khách" },
              current,
            ]
          : [current],
        total: published ? 2 : 1,
      };
    else if (path === "/staff/tickets/existing") data = current;
    await route.fulfill({ json: { data } });
  });
  await page.goto("/staff/tickets/existing");
  const draft = page.getByRole("textbox", { name: /Trả lời khách hàng/ });
  await draft.fill("Bản nháp đang soạn, chưa gửi");
  published = true;
  await expect(
    page.getByRole("button", { name: /Yêu cầu mới từ khách/ }),
  ).toBeVisible({ timeout: 15000 });
  await expect(draft).toHaveValue("Bản nháp đang soạn, chưa gửi");
  await expect(page).toHaveURL(/\/staff\/tickets\/existing$/);
});
