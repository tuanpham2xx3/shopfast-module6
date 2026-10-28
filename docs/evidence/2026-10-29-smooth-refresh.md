# Cập nhật nền không tháo giao diện

Branch `fix/cart-background-refresh`, baseline `ca77003722d1fd2a9d919ea428ab656211685448`.

Nguyên nhân đã xác nhận từ source: dropdown thay list/footer bằng loading mỗi revision; badge reset null mỗi fetch; thêm giỏ tăng revision catalog dù không thay đổi tồn; checkout form nằm dưới điều kiện loading nên bị unmount khi sửa quantity. App còn chạy timer mỗi giây cả khi không có countdown; polling đơn ghi lại cùng response.

Thay đổi: giữ DOM và dữ liệu hiện tại lúc refresh nền, loading lớn chỉ lần đầu; giữ badge đến response mới, chỉ reset khi đổi user; key dropdown theo user tránh giữ dữ liệu qua tài khoản. Không refetch catalog khi thêm giỏ. Giữ form địa chỉ khi đồng bộ giỏ. Mutation dropdown chặn thao tác lặp nhưng giữ focus bằng aria-disabled; checkout chặn lúc refresh. Timer chỉ tồn tại khi có countdown. Polling giữ state khi dữ liệu giống hệt, không ghi đè order version mới bằng response cũ.

Rà cả tickets/admin: không có nhánh loading thay toàn bộ nội dung hoặc interval tự chạy trong hai component này. GitNexus MCP không có trong danh sách công cụ phiên; kiểm tra trực tiếp source/call chain bằng rg.

Kiểm chứng đã chạy:

- Format check, lint và production web build (TypeScript/Vite): PASS.
- Full Playwright với PostgreSQL/Memurai native: **5/5 PASS, 1.8 phút**, không skip. Bao gồm auth, mua/hủy đơn theo role, socket offline/recovery, popup và dropdown desktop/mobile.
- Test dropdown chủ động giữ cả hai GET cart chưa trả response sau mutation: tên hàng, footer thanh toán và badge cũ vẫn hiện, không có loading thay list; DOM node hàng và card sản phẩm vẫn connected. Khi thả response, quantity/tổng mới cập nhật và focus vẫn ở nút tăng. API cho hai ca responsive được mô phỏng rõ ràng; purchase/realtime dùng API/database thật.

Không thay đổi HTTP contract, transaction tồn kho/đơn hoặc idempotency.
