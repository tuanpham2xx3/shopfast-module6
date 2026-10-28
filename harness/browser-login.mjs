import assert from "node:assert/strict";

// Form is already filled. Never log field values or bypass the application limiter.
export async function submitBrowserLogin(page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname.endsWith("/auth/login") &&
          r.request().method() === "POST",
      ),
      page.getByRole("button", { name: "Đăng nhập", exact: true }).click(),
    ]);
    if (response.status() !== 429 || attempt === 2) {
      assert(response.ok(), `Browser login HTTP${response.status()}`);
      return;
    }
    const seconds = Math.max(
      1,
      Number(response.headers()["retry-after"]) || 60,
    );
    assert(
      seconds <= 120,
      "Unexpected login Retry-After; stop instead of bypassing",
    );
    console.log(`Browser login 429: respecting Retry-After ${seconds}s`);
    const until = Date.now() + seconds * 1000 + 1100;
    while (Date.now() < until)
      await page.waitForTimeout(Math.min(1000, until - Date.now()));
  }
}
