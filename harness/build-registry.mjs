import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const file = (await readdir(".")).find((f) => f.endsWith("(SRS).docx.txt"));
const text = (await readFile(file, "utf8")).replace(/\r\n/g, "\n");
const requirements = [];
let section = "GENERAL";
const counts = {};
for (const line of text.split(/\r?\n/)) {
  const f = line.match(/^(F0[1-7])\s/);
  if (f) section = f[1];
  const sections = {
    "Công nghệ & Kiến trúc:": "TECH",
    "Bảo mật (Security):": "SEC",
    "Độ tin cậy và khả năng phục hồi (Reliability):": "REL",
    "Chất lượng mã nguồn (Quality):": "QUALITY",
    "6. Sản phẩm bàn giao (Deliverables)": "DELIVERY",
  };
  if (sections[line.trim()]) section = sections[line.trim()];
  if (line.startsWith("* ")) {
    const group = line.includes("Có triển khai UI") ? "UI" : section;
    const n = (counts[group] = (counts[group] ?? 0) + 1);
    requirements.push({
      id: `${group}-${String(n).padStart(2, "0")}`,
      source: line.slice(2),
      kind: group === "DELIVERY" ? "deliverable" : "requirement",
    });
  }
}
const metrics = [
  [
    "cached-read-p95",
    "Thời gian phản hồi API tra cứu (có bộ nhớ đệm)",
    "Dưới 50 ms ở phân vị 95",
  ],
  [
    "checkout-p95",
    "Thời gian phản hồi endpoint đặt hàng",
    "Dưới 300 ms ở phân vị 95",
  ],
  [
    "realtime",
    "Độ trễ cập nhật trạng thái đơn qua kênh realtime",
    "Dưới 1 giây",
  ],
  ["cache-hit", "Tỉ lệ trúng bộ nhớ đệm cho dữ liệu sản phẩm", "Tối thiểu 80%"],
  ["deploy", "Thời gian hoàn tất một lần triển khai tự động", "Dưới 10 phút"],
];
for (const [id, title, threshold] of metrics) {
  if (!text.includes(title) || !text.includes(threshold))
    throw Error("SRS performance source changed");
  requirements.push({
    id: `PERF-${id}`,
    source: `${title}: ${threshold}`,
    kind: "requirement",
  });
}
requirements.push({
  id: "DEFENSE-explanation",
  source:
    "Học viên không giải thích được các quyết định kỹ thuật trong sản phẩm của mình sẽ không được công nhận kết quả, kể cả khi hệ thống chạy tốt.",
  kind: "human-rehearsal",
});
if (!text.includes(requirements.at(-1).source))
  throw Error("Defense source changed");
const acceptance = (await readFile("docs/08-acceptance.md", "utf8")).replace(
  /\r\n/g,
  "\n",
);
const cases = [
  ...acceptance.matchAll(
    /^\|\s*((?:AUTH|CAT|CART|ORD|RT|RATE|CACHE|JOB|TKT|AI|OPS|UI)-[0-9A-Z]+)\s*\|([^|]+)\|([^|]+)\|/gm,
  ),
].map((m) => ({
  id: m[1],
  given: m[2].trim(),
  expected: m[3].trim(),
  kind: "acceptance-case",
}));
for (const requirement of requirements)
  requirement.id = `REQ-${requirement.id}`;
const registry = {
  schemaVersion: 1,
  source: {
    path: file,
    sha256: createHash("sha256").update(text).digest("hex"),
  },
  requirements,
  cases,
  acceptanceSource: {
    path: "docs/08-acceptance.md",
    sha256: createHash("sha256").update(acceptance).digest("hex"),
  },
};
await writeFile(
  "harness/registries/requirements.json",
  JSON.stringify(registry, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    requirements: requirements.length,
    acceptanceCases: cases.length,
  }),
);
