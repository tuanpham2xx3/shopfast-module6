import { chromium } from "@playwright/test";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
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
  const resourceErrors = [];
  const pageErrors = [];
  page.on("requestfailed", (request) => resourceErrors.push(request.url()));
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(pathToFileURL(resolve(root, "docs/defense/index.html")).href);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() =>
    document.fonts.load('600 28px "Be Vietnam Pro"', "Đơn hàng ShopFast"),
  );
  const assets = await page.evaluate(() => ({
    images: [...document.images].every(
      (img) => img.complete && img.naturalWidth > 0,
    ),
    font: document.fonts.check(
      '600 28px "Be Vietnam Pro"',
      "Đơn hàng ShopFast",
    ),
  }));
  if (!assets.images || !assets.font)
    throw Error(`Slide image/font failed to load: ${JSON.stringify(assets)}`);
  const count = await page.locator("section").count();
  if (count !== 10) throw Error("Expected ten defense slides");
  const issues = [];
  for (let index = 0; index < count; index++) {
    await page.evaluate((active) => {
      window.show(active);
    }, index);
    const overflow = await page.locator("section.active").evaluate((slide) =>
      [...slide.querySelectorAll("h1,h2,h3,p,li,table,.flow,footer,img,.node")]
        .filter((node) => {
          const rect = node.getBoundingClientRect();
          return (
            rect.right > 1281 ||
            rect.bottom > 721 ||
            rect.left < -1 ||
            rect.top < -1
          );
        })
        .map((node) => node.textContent),
    );
    issues.push(...overflow.map((text) => ({ slide: index + 1, text })));
    await page.screenshot({ path: resolve(report, `slide-${index + 1}.png`) });
  }
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  if (
    !(await page.locator("section").nth(1).getAttribute("class"))?.includes(
      "active",
    )
  )
    throw Error("Keyboard navigation failed");
  await page.keyboard.press("n");
  if (!(await page.locator("section.active aside").isVisible()))
    throw Error("Speaker notes keyboard control failed");
  await page.keyboard.press("n");
  for (const viewport of [
    { width: 960, height: 540 },
    { width: 1366, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    const rect = await page.locator("#deck").boundingBox();
    if (
      !rect ||
      rect.x < -1 ||
      rect.y < -1 ||
      rect.x + rect.width > viewport.width + 1 ||
      rect.y + rect.height > viewport.height + 1
    )
      throw Error("Deck does not fit the presentation viewport");
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await page.emulateMedia({ media: "print" });
  const printIssues = await page.locator("section").evaluateAll((slides) =>
    slides.flatMap((slide, index) => {
      const frame = slide.getBoundingClientRect();
      return [...slide.querySelectorAll("h1,h2,h3,p,li,img,.node,footer")]
        .filter((node) => {
          const r = node.getBoundingClientRect();
          return (
            r.width > 0 &&
            r.height > 0 &&
            (r.left < frame.left - 1 ||
              r.right > frame.right + 1 ||
              r.top < frame.top - 1 ||
              r.bottom > frame.bottom + 1)
          );
        })
        .map((node) => ({ slide: index + 1, text: node.textContent }));
    }),
  );
  for (let index = 0; index < count; index++)
    await page
      .locator("section")
      .nth(index)
      .screenshot({
        path: resolve(report, `print-slide-${index + 1}.png`),
      });
  const pdf = resolve(root, "docs/defense/shopfast-defense.pdf");
  await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
  const pdfPages =
    (await readFile(pdf)).toString("latin1").match(/\/Type\s*\/Page\b/g)
      ?.length ?? 0;
  if (pdfPages !== count)
    throw Error(`PDF has ${pdfPages} pages instead of ${count}`);
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => window.show(0));
  await page.locator("#notes").click();
  if (!(await page.locator("body").getAttribute("class"))?.includes("notes"))
    throw Error("Speaker notes control failed");
  await page.locator("#prev").click();
  await page.locator("#next").click();
  const result = {
    executedAt: new Date().toISOString(),
    slides: count,
    issues,
    printIssues,
    pdfBytes: (await stat(pdf)).size,
    pdfPages,
    assets,
    resourceErrors,
    pageErrors,
  };
  await writeFile(
    resolve(report, "validation.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
  if (
    issues.length ||
    printIssues.length ||
    resourceErrors.length ||
    pageErrors.length
  )
    process.exitCode = 1;
} finally {
  await browser.close();
}
