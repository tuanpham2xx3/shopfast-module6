# Dọn UI/UX theo tác vụ

Branch `feat/ui-cleanup`; baseline `697e40aadcce5fc4e196c1672c2666ffbca6292c`.

## Audit và thay đổi

Đã chụp bản production trước sửa ở desktop1280/mobile390 và đăng nhập thật bốn role. Những phần dư được xử lý: hero marketing ở auth, metadata/credit lặp mỗi card, hai hàng nút dài trên sản phẩm, phân trang vô dụng, form ticket trống luôn mở, list/filter lặp ở checkout/detail và JSON operations hiện trực tiếp.

- `/` vào `/products`; auth một cột, icon theme có accessible name, menu mobile gọn để giữ giỏ trong chiều ngang.
- Product actions một hàng, credit chung cuối catalog và đầy đủ ở popup; SKU/brand chỉ hiện khi xem chi tiết. Bộ lọc mobile có disclosure và giữ query URL. Pagination chỉ có khi nhiều trang.
- Checkout/detail tập trung đúng tác vụ. Trạng thái và action tiếng Việt, option value và payload vẫn enum API. Nút hủy đơn có thứ bậc phụ và màu cảnh báo, tách khỏi thanh toán mô phỏng.
- Form ticket mở theo yêu cầu, có hủy; draft AI/Confirm/Reject/ownership giữ nguyên. Chứng cứ và lookup metadata có disclosure, không xóa dữ liệu cần review.
- Operations có service rows và queue counts từ API. Trạng thái chưa kiểm tra/lỗi không bị đổi thành zero/success; CLOSED circuit Gemini không được gán là provider khỏe. JSON vẫn mở được trong Chi tiết kỹ thuật.
- Harness đi trực tiếp `/login`, truy cập order route riêng và kiểm nhãn UI mới; các assertions DB/HTTP và counts không bị thay bằng mock.

## Kiểm tra đã chạy

- Lint, TypeScript, production web build, format check: PASS.
- Architecture check: 45 file TypeScript, zero violations. Harness check: 41 file parsed, PASS.
- Full Playwright với PostgreSQL/Memurai native: **19/19 PASS, 1.7 phút**, không skip. Purchase/stock/payment/cancel/warehouse/ticket/socket recovery/admin Redis queue chạy API/database thật; auth/popup/routing và năm ca UI presentation dùng fixture có chủ đích.
- Sau tinh chỉnh menu/caption: targeted auth/cart/UI 9/9 PASS; năm ca UI chạy lại 5/5 PASS sau style action hủy đơn, lint/build lại PASS.
- Năm ca UI kiểm: filter dịch nhãn vẫn gửi `PENDING_PAYMENT`, checkout/detail không lặp list, tạo/hủy form ticket và focus, queue counts chính xác, metadata disclosure, lỗi503 không hiện zero/success, mobile filter/credit/pagination. Không có request Gemini thật hoặc gửi email trong suite deterministic.
- Một lượt mới đạt18/19 vì `getByLabel` không tìm select có options trong label; đổi locator sang combobox theo accessible name, giữ nguyên assertion enum và chạy lại toàn bộ đạt.

Đã mở và xem ảnh auth mobile, catalog mobile, operations desktop và detail đơn mobile. Bản sau dưới đây là screenshot từ API fixture/synthetic data; bản trước là public production, không coi số lượng/giá fixture là số liệu production.

| Khu vực | Trước | Sau |
| --- | --- | --- |
| Auth | [Mobile](2026-10-29-ui-before-auth.png) | [Mobile](2026-10-29-ui-clean-auth.png) |
| Catalog | [Desktop](2026-10-29-ui-before-store.png) | [Mobile](2026-10-29-ui-clean-store.png) |
| Operations | Audit production trong harness/reports, không commit dữ liệu tài khoản | [Desktop](2026-10-29-ui-clean-operations.png) |
| Chi tiết đơn | List và filter lặp bên trên | [Mobile](2026-10-29-ui-clean-order.png) |

Không thay backend transaction, database, API, Redis/Gemini/email configuration. Full provider/performance/restore harness không chạy lại trong lượt UI này; kết quả cũ không gán cho source mới. CI và production smoke chỉ đánh đạt sau khi thực thi.
