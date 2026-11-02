# Bộ trình bày bảo vệ

Bản thiết kế lại 02/11/2026: 10 slide theo mạch **bài toán → luồng sản phẩm → giải pháp → demo AI → kiến trúc → kiểm chứng → kết quả**. Font và ảnh đóng gói tại chỗ; mở được offline.

- [Kịch bản nói và thao tác đủ khung 10 phút](10-minute-script.md): lời thoại theo từng slide, câu hỏi Gemini để copy, tab evidence và phương án khi demo chậm.

- Mở [deck HTML](index.html) bằng Chrome/Edge: ←/→ chuyển trang, N hiện ghi chú, F toàn màn hình; rê chuột góc dưới phải để hiện điều khiển. Không cần server để xem nội dung.
- [PDF 10 trang](shopfast-defense.pdf) dùng khi máy trình chiếu không hỗ trợ HTML; ghi chú nằm trong HTML và [kịch bản diễn tập](../18-defense-walkthrough.md).
- Tái xuất và kiểm khung: từ repository root chạy `node tools/scripts/render-defense.mjs`. Cần dependencies trong tools và Chromium Playwright đã cài. Ảnh từng slide và validation report ở ignored `harness/reports/defense/`.

Mỗi slide có ghi chú nói và mốc thời gian, khớp [kịch bản 10 phút](10-minute-script.md). Hình giao diện là ảnh chụp ShopFast thật; [nguồn hình/font](assets/README.md).

PDF có 10 trang 16:9. Kiểm tra bằng trình duyệt gồm: khung hình, ảnh/font offline, ghi chú, phím chuyển trang và tỉ lệ ở các viewport. Kịch bản vẫn cần người trình bày tự tập và bấm giờ. CI trên slide thuộc `378b747`; restore 7 giây thuộc lần chạy 29/10 trên `ffcb599`, không được gán sang release mới.
