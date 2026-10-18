import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import {
  GoogleGeminiProvider,
  classificationSchema,
  ProviderError,
} from "../libs/modules/ai/gemini.provider";

async function main() {
  if (!process.env.GEMINI_API_KEY || !process.env.GEMINI_MODEL)
    throw new Error("Configure backend GEMINI_API_KEY and GEMINI_MODEL first");
  const provider = new GoogleGeminiProvider();
  const intervalMs = Math.max(
    5000,
    Number(process.env.GEMINI_SMOKE_INTERVAL_MS) || 5000,
  );
  let nextRequestAt = 0;
  async function generate(body: string) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const wait = Math.max(0, nextRequestAt - Date.now());
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      nextRequestAt = Date.now() + intervalMs;
      try {
        return await provider.generate({
          contents: [
            {
              role: "user",
              parts: [{ text: JSON.stringify({ subject: body, body }) }],
            },
          ],
          classification: true,
          signal: AbortSignal.timeout(12000),
        });
      } catch (error) {
        if (
          error instanceof ProviderError &&
          error.status === 429 &&
          attempt < 2
        ) {
          const delay = Math.max(60000, error.retryAfter);
          nextRequestAt = Math.max(nextRequestAt, Date.now() + delay);
          console.log(
            `Rate limited; retrying sample after ${Math.ceil(delay / 1000)}s`,
          );
          continue;
        }
        throw error;
      }
    }
    throw new Error("Retry limit reached");
  }
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
  let previous: {
    model?: string;
    results?: { expected: string; predicted?: string; confidence?: number }[];
  } = {};
  if (process.env.GEMINI_SMOKE_RESUME === "true")
    try {
      previous = JSON.parse(
        await readFile("docs/evidence/gemini-live-evaluation.json", "utf8"),
      );
    } catch {
      /* Start a fresh evaluation if no checkpoint exists. */
    }
  const results: {
    expected: string;
    predicted?: string;
    confidence?: number;
    status?: string;
    httpStatus?: number | null;
    errorType?: string;
  }[] = [];
  for (let group = 0; group < categories.length; group++)
    for (const body of examples[group]!) {
      const expected = categories[group]!;
      const old =
        previous.model === process.env.GEMINI_MODEL
          ? previous.results?.[results.length]
          : undefined;
      if (old?.predicted && old.expected === expected) {
        matrix[expected]![old.predicted]!++;
        if (old.predicted === expected) correct++;
        results.push(old);
        continue;
      }
      try {
        const parts = await generate(body);
        const parsed = classificationSchema.parse(
          JSON.parse(
            parts
              .map((p) => p.text ?? "")
              .join("")
              .replace(/^```(?:json)?\s*|\s*```$/g, ""),
          ),
        );
        matrix[expected]![parsed.category]!++;
        if (parsed.category === expected) correct++;
        results.push({
          expected,
          predicted: parsed.category,
          confidence: parsed.confidence,
        });
      } catch (error) {
        if (error instanceof Error && error.name === "ZodError")
          console.log(
            JSON.stringify({
              sample: results.length + 1,
              issues: (error as unknown as { issues: unknown }).issues,
            }),
          );
        results.push({
          expected,
          status: "UNAVAILABLE",
          httpStatus: error instanceof ProviderError ? error.status : null,
          errorType: error instanceof Error ? error.name : "Unknown",
        });
      }
      console.log(`Completed ${results.length}/30 samples`);
    }
  const report = {
    model: process.env.GEMINI_MODEL,
    executedAt: new Date().toISOString(),
    total: 30,
    intervalMs,
    resumed:
      process.env.GEMINI_SMOKE_RESUME === "true" &&
      previous.model === process.env.GEMINI_MODEL,
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
