# Frontend browser routes

Baseline `47e16843c548474ad7657f0bcfdeec3916a9c716`; branch `feat/browser-routes`.

## Phạm vi

React Router DOM 7.18.5, BrowserRouter. Bản đồ route nằm trong `apps/web/src/routing.ts`: auth/account, catalog/product popup, cart/checkout, customer và staff orders/tickets, inventory, ba khu vực admin. URL thay state chọn màn hình; ID chi tiết lấy từ URL và gọi API theo quyền. Query catalog giữ filter/sort/page. Popup và giỏ dropdown vẫn giữ hành vi hiện có.

Guard chờ session restore trước khi mount component nghiệp vụ. Guest/khách chưa verify được dẫn qua login/verify với return URL nội bộ đã kiểm tra; sai role có 403, route lạ có 404. Backend tiếp tục kiểm ownership/role. HTTP status của trang lỗi SPA là 200 (trang FE hiển thị mã); HTTP API trả mã lỗi riêng.

`/cart` sửa giỏ, `/checkout` có form địa chỉ; đơn hàng và kho có menu riêng. Admin tách nội dung theo catalog/promotions/operations. Form/draft không reset do background refresh cùng resource; đổi resource ID xóa chi tiết cũ trước khi nhận kết quả mới.

Nginx bỏ HTTP proxy `/orders/` để deep link đơn trả SPA; transport Socket.IO vẫn `/socket.io/`, namespace `/orders` giữ nguyên. Cần kiểm tra production sau release, không suy từ Vite rằng Nginx đã đạt.

## Kiểm chứng local đã chạy

- `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run build:web`: PASS.
- `npm run architecture:check`: PASS, 43 file TypeScript, zero violations.
- `npm run harness:check`: PASS, 41 source files parsed.
- `npm run test:e2e` với PostgreSQL/Memurai native: **14/14 PASS, 1.6 phút**, không skip.
- 9 ca routing dùng API fixture có chủ đích: product deep link/reload/Back/Forward, filter URL, private deep link chờ restore, quay lại sau login/verify, chặn return URL ngoài site, 403 không gọi API đặc quyền, 404 và chi tiết ticket/order theo cả 4 role, inventory/admin panel riêng.
- Purchase/realtime test dùng HTTP API/database thật: điều chỉnh kho ở route riêng, mua/đặt/hủy/thanh toán mô phỏng, missed socket event recovery, kho giao hàng, ticket/AI unavailable và admin Redis queue dashboard. Hai ca desktop/mobile giữ kiểm tra dropdown, popup và cập nhật nền không tháo DOM.

Lượt đầu còn selector cũ tìm inventory trong catalog; lượt tiếp theo tìm sản phẩm ở tab operations. Đã sửa thao tác điều hướng tới route tương ứng, giữ nguyên assertions nghiệp vụ và chạy lại toàn bộ đạt. Một lượt routing bị server Vite của runner khác đóng; lượt chạy độc lập và lượt tổng thể sau đó đều đạt. Test auth đã đổi kỳ vọng reload từ register mặc định sang giữ `/login`.

Harness production `harness/browser-roles.cjs` đã cập nhật để đăng nhập và refresh workspace đúng URL cho customer/warehouse/support/admin. Kết quả cloud chỉ được ghi sau khi chạy trên bản release.

CI lần đầu: 13/14 đạt; ca popup desktop bấm tọa độ backdrop ngay sau trigger mà chưa chờ dialog visible khi điều hướng bất đồng bộ. Đã thêm chờ visible trước thao tác tọa độ, giữ nguyên assertion đóng và kiểm tra thêm giỏ sau đó; chạy lại targeted browser suite và CI để xác nhận.
