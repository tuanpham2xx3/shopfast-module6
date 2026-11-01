import { existsSync } from "node:fs";
import PDFDocument from "pdfkit";
export function renderInvoice(
  order: { code: string; total: string; discount: string },
  items: { name_snapshot: string; quantity: number; line_total: string }[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 45 });
    const font =
      process.env.PDF_FONT_PATH ??
      (process.platform === "win32"
        ? "C:/Windows/Fonts/arial.ttf"
        : "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf");
    if (existsSync(font)) doc.font(font);
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.fontSize(24).text("ShopFast Invoice");
    doc.fontSize(12).text(order.code);
    for (const item of items)
      doc.text(
        `${item.name_snapshot} | ${item.quantity} | ${item.line_total} VND`,
      );
    doc
      .text(`Discount: ${order.discount} VND`)
      .text(`Total paid: ${order.total} VND`);
    doc.end();
  });
}
