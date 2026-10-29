# Dọn phần đơn hàng thừa ở catalog

Branch `fix/catalog-orders-cleanup`, baseline `2d7288e2c8dd8a3a75fe009c10ec3de83e2271a5`.

Bỏ Orders component ở cuối catalog, bao gồm tiêu đề, bộ lọc, empty state và phân trang thừa. Lịch sử/xử lý đơn vẫn có ở `/orders` và `/staff/orders`, truy cập từ menu. Trên trang đơn/checkout, phân trang chỉ hiện khi tổng kết quả vượt page size 20. Không đổi API hoặc nghiệp vụ đơn.

Lint và production web build (TypeScript/Vite): PASS.

`npx playwright test tests/e2e/product-dialog.e2e.spec.ts`: **2/2 PASS, 9.2 giây** trên desktop1280/mobile390. Assert catalog không còn tiêu đề đơn và không gọi API orders, kiểm tra không có phân trang khi orders rỗng; toàn bộ popup/dropdown, tăng/giảm/xóa, giữ DOM khi refresh chậm và sang checkout vẫn đạt. API của suite responsive là fixture có chủ đích.
