import "dotenv/config";
import { writeFile } from "node:fs/promises";
import {
  GoogleGeminiProvider,
  classificationSchema,
} from "../libs/modules/ai/gemini.provider";

async function main() {
  if (!process.env.GEMINI_API_KEY || !process.env.GEMINI_MODEL)
    throw new Error("Configure backend GEMINI_API_KEY and GEMINI_MODEL first");
  const provider = new GoogleGeminiProvider();
  const categories = [
    "ORDER_STATUS",
    "PAYMENT",
    "INVENTORY",
    "DELIVERY",
    "CANCELLATION",
    "OTHER",
  ] as const;
  const examples = [
    [
      "Đơn của tôi đang ở trạng thái nào?",
      "Kiểm tra tiến độ đơn SF123 giúp tôi",
      "Đã xác nhận đơn hàng chưa?",
      "Tôi muốn xem tình trạng xử lý đơn",
      "Đơn đặt hôm qua đã xử lý đến đâu?",
    ],
    [
      "Tôi không thanh toán được",
      "Tôi đã trả tiền nhưng vẫn báo chưa thanh toán",
      "Kiểm tra hóa đơn thanh toán giúp tôi",
      "Thanh toán mô phỏng báo lỗi",
      "Tôi cần xác nhận tiền đã thanh toán",
    ],
    [
      "SKU AUDIO-1 còn hàng không?",
      "Sản phẩm tai nghe còn bao nhiêu chiếc?",
      "Có thể mua 10 chiếc loa trong kho không?",
      "Tồn kho của micro còn không?",
      "Sản phẩm đang hết hàng hay còn hàng?",
    ],
    [
      "Kiện hàng giao chậm quá",
      "Người giao hàng chưa đến địa chỉ",
      "Tôi chưa nhận được bưu kiện",
      "Thời gian giao hàng dự kiến là khi nào?",
      "Đơn đang vận chuyển nhưng giao sai địa chỉ",
    ],
    [
      "Tôi muốn hủy đơn chưa xử lý",
      "Giúp tôi hủy đơn vừa đặt",
      "Không muốn mua nữa, xin hủy đơn",
      "Tôi muốn ngừng đơn hàng này",
      "Hủy giúp đơn trước khi kho xử lý",
    ],
    [
      "Tôi muốn đổi tên hiển thị tài khoản",
      "Trang web không hiển thị tiếng Việt",
      "Tôi cần hỏi về chính sách cửa hàng",
      "Nút hỗ trợ trên trang đang lỗi",
      "Tôi muốn góp ý giao diện website",
    ],
  ];
  const matrix = Object.fromEntries(
    categories.map((c) => [
      c,
      Object.fromEntries(categories.map((p) => [p, 0])),
    ]),
  );
  let correct = 0;
  const results = [];
  for (let group = 0; group < categories.length; group++)
    for (const body of examples[group]!) {
      const expected = categories[group]!;
      try {
        const parts = await provider.generate({
          contents: [
            {
              role: "user",
              parts: [{ text: JSON.stringify({ subject: body, body }) }],
            },
          ],
          classification: true,
          signal: AbortSignal.timeout(12000),
        });
        const parsed = classificationSchema.parse(
          JSON.parse(parts.map((p) => p.text ?? "").join("")),
        );
        matrix[expected]![parsed.category]!++;
        if (parsed.category === expected) correct++;
        results.push({
          expected,
          predicted: parsed.category,
          confidence: parsed.confidence,
        });
      } catch {
        results.push({ expected, status: "UNAVAILABLE" });
      }
    }
  const report = {
    model: process.env.GEMINI_MODEL,
    executedAt: new Date().toISOString(),
    total: 30,
    correct,
    accuracy: correct / 30,
    matrix,
    results,
    acceptance: correct / 30 >= 0.8 ? "PASS" : "FAIL",
  };
  await writeFile(
    "docs/evidence/gemini-live-evaluation.json",
    JSON.stringify(report, null, 2),
  );
  console.log(`Gemini evaluation: ${correct}/30; report saved`);
  if (report.acceptance !== "PASS") process.exitCode = 1;
}
void main().catch(() => {
  console.error(
    "Gemini smoke unavailable; verify backend configuration/provider quota. No key was logged.",
  );
  process.exitCode = 1;
});
