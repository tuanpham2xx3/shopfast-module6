import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
const root = resolve(import.meta.dirname, "../..");
const folder = resolve(root, "FE/public/images/products/catalog-v2");
const manifest = resolve(folder, "sources.json");
const sources = JSON.parse(await readFile(manifest, "utf8"));
await mkdir(folder, { recursive: true });
let count = 0;
for (const entry of sources) {
  if (!/^sf-demo-(?:hp|sp|mc)-\d{2}\.(?:jpg|png|webp)$/.test(entry.file))
    throw Error("Unsafe image filename");
  if (!new URL(entry.downloadUrl).hostname.endsWith(".wikimedia.org"))
    throw Error("Unexpected image host");
  const target = resolve(folder, entry.file);
  if (dirname(target) !== folder) throw Error("Path escapes image folder");
  let bytes;
  try {
    bytes = await readFile(target);
    if (
      entry.sha256 &&
      createHash("sha256").update(bytes).digest("hex") === entry.sha256
    ) {
      count++;
      continue;
    }
  } catch {}
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(entry.downloadUrl, {
      headers: {
        "User-Agent":
          "ShopFastDemo/1.0 (educational project; source attribution retained)",
      },
      signal: AbortSignal.timeout(30000),
    });
    if (r.ok) {
      if (!r.headers.get("content-type")?.startsWith("image/"))
        throw Error("Non-image response");
      bytes = Buffer.from(await r.arrayBuffer());
      break;
    }
    if ((r.status === 429 || r.status >= 500) && attempt < 3) {
      const wait = Math.min(
        60000,
        Math.max(
          Number(r.headers.get("retry-after") || 0) * 1000,
          1500 * (attempt + 1),
        ),
      );
      await new Promise((x) => setTimeout(x, wait));
      continue;
    }
    throw Error(`${entry.file}: HTTP ${r.status}`);
  }
  if (!bytes || bytes.length < 1000 || bytes.length > 3000000)
    throw Error("Unexpected image size");
  await writeFile(target, bytes);
  entry.bytes = bytes.length;
  entry.sha256 = createHash("sha256").update(bytes).digest("hex");
  await writeFile(manifest, JSON.stringify(sources, null, 2) + "\n");
  count++;
  if (count % 7 === 0) console.log(`Downloaded ${count}/${sources.length}`);
  await new Promise((x) => setTimeout(x, 350));
}
if (new Set(sources.map((x) => x.sha256)).size !== sources.length)
  throw Error("Duplicate image content");
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const html = `<!doctype html><html lang="vi"><meta charset="utf-8"><title>Nguồn ảnh sản phẩm demo ShopFast</title><style>body{font:16px/1.6 system-ui;max-width:1000px;margin:40px auto;padding:0 20px;color:#173c31}article{display:grid;grid-template-columns:140px 1fr;gap:24px;padding:24px 0;border-bottom:1px solid #ddd}img{width:140px;height:140px;object-fit:contain}h2{font-size:18px}a{color:#176b4a}</style><h1>Nguồn ảnh sản phẩm demo</h1><p>Ảnh dùng để minh họa dòng sản phẩm, không khẳng định model thương mại tương ứng với tên/giá demo. Lưu bản thumbnail nguyên trạng; tác giả và giấy phép theo từng nguồn bên dưới.</p>${sources.map((s) => `<article><img loading="lazy" src="${esc(s.file)}" alt="${esc(s.sku)}"><div><h2>${esc(s.sku)} · ${esc(s.title)}</h2><p>Tác giả: ${esc(s.author)}<br>Giấy phép: <a href="${esc(s.licenseUrl)}">${esc(s.license)}</a><br><a href="${esc(s.sourcePage)}">Trang nguồn Wikimedia Commons</a><br>Thay đổi: ${esc(s.changes)}</p></div></article>`).join("")}</html>`;
await writeFile(resolve(folder, "credits.html"), html);
console.log(
  JSON.stringify({
    images: sources.length,
    uniqueHashes: new Set(sources.map((x) => x.sha256)).size,
    attribution: "credits.html",
  }),
);
