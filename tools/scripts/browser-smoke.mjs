import { chromium } from "@playwright/test";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(
    "<title>ShopFast tooling</title><button>Kiểm tra</button>",
  );
  await page.getByRole("button", { name: "Kiểm tra" }).click();
  if ((await page.title()) !== "ShopFast tooling")
    throw new Error("Title assertion failed");
  console.log("PASS: Chromium launch, DOM interaction and assertion");
} finally {
  await browser.close();
}
