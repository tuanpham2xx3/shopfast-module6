# Giỏ hàng dropdown

Branch `feat/cart-dropdown`, baseline `bded71c25871202bad63013491f7d758a1c488f9`.

Icon menu bật/tắt dropdown thay vì chuyển thẳng sang trang giỏ. Panel chứa tên hàng, đơn giá, quantity, tăng/giảm, xóa, tổng dòng, tạm tính và nút sang checkout. Dữ liệu và badge lấy từ API; không đổi transaction/idempotency backend. Có loading, lỗi/retry, trạng thái giỏ trống và lời mời đăng nhập cho guest. Đóng bằng X, Escape, bấm ngoài hoặc chuyển focus ra ngoài.

Kiểm tra đã chạy:

- Lint, format check, TypeScript và production web build: PASS.
- Hai ca Playwright 1280px/390px: 2/2 PASS, 6.5 giây. API mô phỏng có chủ đích: mở dropdown trong catalog, tăng/giảm cập nhật badge và tạm tính, Escape/focus restore, bấm ngoài, sang checkout, sửa/xóa dòng. Popup sản phẩm và kiểm tra không tràn ngang vẫn đạt.
- Đã mở screenshot mobile và kiểm tra trực quan panel dưới menu, đầy đủ controls và nút thanh toán.
- Full `npm run test:e2e` với PostgreSQL/Memurai native: **5/5 PASS, 2.2 phút**, không skip. Luồng mua hàng qua dropdown → checkout → đặt/hủy đơn, role operations và khôi phục socket dùng API/database thật.

Ảnh minh chứng: [desktop](2026-10-29-cart-dropdown-desktop.png), [mobile](2026-10-29-cart-dropdown-mobile.png).

Lượt test đầu dùng selector heading không tồn tại và timeout; đã đổi thao tác bấm ngoài sang brand thực tế rồi chạy lại. Không bỏ assertions nghiệp vụ để đạt test.
