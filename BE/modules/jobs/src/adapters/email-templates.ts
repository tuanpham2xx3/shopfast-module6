export function escapeHtml(value: unknown) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function renderEmail(p: Record<string, unknown>, origin: string) {
  const base = new URL(origin);
  if (base.protocol !== "https:" || base.username || base.password)
    throw new Error("EMAIL_ORIGIN_REQUIRES_HTTPS");
  const money = (v: unknown) =>
    new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(Number(v ?? 0));
  let subject: string,
    title: string,
    text: string,
    detail = "",
    label = "Mở ShopFast";
  const url = new URL("/", base).href;
  if (p.template === "verify-email") {
    if (!/^\d{6}$/.test(String(p.code))) throw new Error("INVALID_EMAIL_CODE");
    subject = "Mã xác minh tài khoản ShopFast";
    title = "Chào mừng bạn đến ShopFast";
    text = `Mã xác minh của bạn: ${p.code}. Có hiệu lực 10 phút. Không chia sẻ mã này với bất kỳ ai. Nếu bạn không yêu cầu, hãy bỏ qua email.`;
    detail = `<div style="font-size:36px;letter-spacing:10px;font-weight:700;text-align:center;padding:24px;background:#f1f5f9;border-radius:12px">${escapeHtml(p.code)}</div>`;
  } else if (
    p.template === "email.order-confirmation" ||
    p.template === "payment.remind"
  ) {
    const reminder = p.template === "payment.remind";
    subject = `${reminder ? "Nhắc thanh toán" : "Đã nhận đơn hàng"} ${p.orderCode}`;
    title = reminder ? "Đơn hàng đang chờ bạn" : "Cảm ơn bạn đã đặt hàng";
    text = `Đơn ${p.orderCode}. ${reminder ? "Vui lòng hoàn tất thanh toán trước khi đơn hết hạn." : "ShopFast đã tiếp nhận đơn hàng của bạn."} Tổng tiền: ${money(p.total)}. ${p.expiresAt && reminder ? `Hết hạn: ${new Date(String(p.expiresAt)).toLocaleString("vi-VN", { timeZone: "Asia/Bangkok" })}.` : ""}`;
    const items = Array.isArray(p.items)
      ? (p.items as Record<string, unknown>[])
      : [];
    detail = items
      .map(
        (i) =>
          `<tr><td style="padding:12px 0;border-bottom:1px solid #e2e8f0">${escapeHtml(i.name)} × ${escapeHtml(i.quantity)}</td><td style="text-align:right">${escapeHtml(money(i.lineTotal))}</td></tr>`,
      )
      .join("");
    detail = `<table style="width:100%;border-collapse:collapse">${detail}<tr><td style="padding-top:16px">Giảm giá</td><td style="text-align:right">${escapeHtml(money(p.discount))}</td></tr><tr><td style="padding-top:12px;font-weight:700">Tổng cộng</td><td style="text-align:right;font-weight:700">${escapeHtml(money(p.total))}</td></tr></table>`;
    label = "Xem đơn hàng";
  } else if (p.template === "daily-revenue") {
    subject = `Báo cáo doanh thu ShopFast — ${p.businessDate}`;
    title = "Một ngày tại ShopFast";
    text = `Ngày nghiệp vụ ${p.businessDate} (Asia/Bangkok). Đơn đã giao: ${p.orderCount}. Doanh thu: ${money(p.total)}. Đăng nhập tài khoản quản trị để xem báo cáo.`;
    label = "Mở trang quản trị";
  } else throw new Error("UNSUPPORTED_EMAIL_TEMPLATE");
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a"><table role="presentation" style="width:100%;padding:32px 12px"><tr><td align="center"><table role="presentation" style="width:100%;max-width:600px;background:white;border-radius:16px"><tr><td style="padding:32px"><div style="font-size:24px;font-weight:800;color:#0369a1">ShopFast<span style="color:#f97316">.</span></div><p style="font-size:12px;color:#64748b;letter-spacing:2px">MUA SẮM THẬT DỄ DÀNG</p><h1 style="font-size:26px;line-height:1.3;margin-top:32px">${escapeHtml(title)}</h1><p style="line-height:1.8;color:#334155">${escapeHtml(text)}</p>${detail}<p style="margin:32px 0"><a href="${escapeHtml(url)}" style="background:#0369a1;color:white;text-decoration:none;padding:14px 24px;display:inline-block;border-radius:8px;font-weight:bold">${escapeHtml(label)}</a></p><hr style="border:0;border-top:1px solid #e2e8f0"><p style="font-size:12px;line-height:1.8;color:#64748b">Email tự động từ ShopFast. Không chia sẻ mật khẩu hoặc mã xác minh. Bạn có thể quản lý đơn và yêu cầu hỗ trợ sau khi đăng nhập.</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, text: `${text}\n${url}`, html };
}
