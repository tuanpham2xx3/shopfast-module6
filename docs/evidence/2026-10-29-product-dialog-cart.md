# Popup sản phẩm và giỏ hàng trên menu

Branch: `feat/product-detail-dialog`; baseline: `aeed87d4da6eb3961459d7e2f03657d07b3f0c4d`.

## Phạm vi

- “Xem …” mở dialog chi tiết sản phẩm, đóng bằng X/Escape/backdrop, khóa cuộn nền và trả focus về nút mở.
- Tab/Shift+Tab tuần hoàn trong dialog. Lượt bổ sung kiểm tra Tab ban đầu thất bại; đã bổ sung xử lý focus và chạy lại đạt.
- Icon giỏ hàng nằm trên menu, badge lấy tổng quantity từ API; mở giỏ/checkout riêng. Catalog không còn form checkout ở cuối.
- Giỏ có trạng thái loading, lỗi và thử lại. Giữ nguyên API, transaction và idempotency của đơn hàng.

## Kiểm tra đã chạy

- `npm run format:check`: PASS.
- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm run build:web`: PASS (TypeScript + Vite production).
- `npx playwright test tests/e2e/product-dialog.e2e.spec.ts`: 2/2 PASS, 9.1 giây sau sửa focus; API được mô phỏng có chủ đích. Desktop 1280px và mobile 390px: thông tin sản phẩm, ba cách đóng, focus/scroll, thêm hàng, badge, mở giỏ, sửa quantity, xóa và không tràn ngang.
- `npm run test:e2e` với PostgreSQL native và Memurai native: **5/5 PASS, 2.3 phút**, không skip. Bao gồm đăng ký/xác minh, mua hàng qua icon giỏ, đặt/hủy đơn, thao tác theo role và khôi phục socket sau offline với API/database thật; hai ca popup dùng API mô phỏng như đã nêu.

Screenshot mobile đã được mở và kiểm tra trực quan. Screenshot do Playwright tạo trong `test-results/`; bản minh chứng chọn lọc lưu cạnh tài liệu này.

- [Mobile](2026-10-29-product-popup-mobile.png)
- [Desktop](2026-10-29-product-popup-desktop.png)

Đây là bằng chứng cho thay đổi UI này, không thay thế nghiệm thu provider Gemini hoặc quyền AWS còn tồn tại trong báo cáo bàn giao.
