import { chromium } from "@playwright/test";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const root = resolve(import.meta.dirname, "../..");
const report = resolve(root, "harness/reports/defense");
await mkdir(report, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  await page.goto(pathToFileURL(resolve(root, "docs/defense/index.html")).href);
  await page.evaluate(() => document.fonts.ready);
  const count = await page.locator("section").count();
  if (count !== 10) throw Error("Expected ten defense slides");
  const issues = [];
  for (let index = 0; index < count; index++) {
    await page.evaluate((active) => {
      document
        .querySelectorAll("section")
        .forEach((slide, current) =>
          slide.classList.toggle("active", current === active),
        );
    }, index);
    const overflow = await page.locator("section.active").evaluate((slide) =>
      [...slide.querySelectorAll("h1,h2,p,li,table,.flow,footer")]
        .filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.right > 1280 || rect.bottom > 720 || rect.left < 0;
        })
        .map((node) => node.textContent),
    );
    issues.push(...overflow.map((text) => ({ slide: index + 1, text })));
    await page.screenshot({ path: resolve(report, `slide-${index + 1}.png`) });
  }
  const pdf = resolve(root, "docs/defense/shopfast-defense.pdf");
  await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
  await page.locator("#notes").click();
  if (!(await page.locator("body").getAttribute("class"))?.includes("notes"))
    throw Error("Speaker notes control failed");
  await page.locator("#prev").click();
  await page.locator("#next").click();
  const result = {
    executedAt: new Date().toISOString(),
    slides: count,
    issues,
    pdfBytes: (await stat(pdf)).size,
  };
  await writeFile(
    resolve(report, "validation.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
  if (issues.length) process.exitCode = 1;
} finally {
  await browser.close();
}
