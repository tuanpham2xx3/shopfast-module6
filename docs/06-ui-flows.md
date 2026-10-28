# 06 — UI web và luồng sử dụng

UI phục vụ hoàn thành nghiệp vụ và minh họa tính năng; không xây landing page hoặc trang tính năng không hoạt động. React/TypeScript, responsive desktop/mobile, nhãn tiếng Việt, format tiền VND và giờ Asia/Bangkok.

## 1. Bản đồ màn hình

| Khu vực  | Route                              | Nội dung                                                                  |
| -------- | ---------------------------------- | ------------------------------------------------------------------------- |
| Public   | /products                          | filter category/brand/price, sort, pagination                             |
| Public   | /products/:id                      | ảnh, giá, tồn khả dụng, quantity, thêm giỏ                                |
| Auth     | /login, /register, /verify-email   | đăng ký nhận session giới hạn rồi nhập mã ngay; đăng nhập tài khoản đã có |
| Customer | /cart                              | sửa/xóa dòng, tổng tạm tính                                               |
| Customer | /checkout                          | địa chỉ, xác nhận giá, promo tùy chọn                                     |
| Customer | /orders, /orders/:id               | lịch sử, timeline, realtime, mock payment, cancel, invoice                |
| Customer | /tickets, /tickets/:id             | tạo ticket, hội thoại, trạng thái                                         |
| Staff    | /staff/orders, /staff/orders/:id   | lọc và đổi trạng thái đúng quyền                                          |
| Staff    | /staff/inventory                   | điều chỉnh tồn, xem movement                                              |
| Support  | /staff/tickets, /staff/tickets/:id | claim, phân loại, reply, AI panel                                         |
| Admin    | /admin/catalog                     | category/brand/product, giá, active                                       |
| Admin    | /admin/promotions                  | tạo và ngừng promo                                                        |
| Admin    | /admin/operations                  | health, queue, failed jobs, retry                                         |

Route guard chỉ hỗ trợ trải nghiệm, mọi quyền bắt buộc kiểm tra lại ở server. Menu ẩn theo role; URL trực tiếp sai quyền có trang 403. Unknown route có 404.

## 2. Luồng mua hàng

Catalog: nút “Xem …” mở dialog chi tiết có ảnh, giá, tồn khả dụng, SKU, thương hiệu, danh mục và mô tả. Dialog khóa cuộn nền, giữ focus bên trong; đóng bằng X, Escape hoặc bấm ngoài và trả focus về nút mở. Bố cục một cột trên mobile.

Thanh điều hướng có icon giỏ hàng cho khách và customer, badge là tổng số lượng sản phẩm từ server. Bấm bật/tắt dropdown giỏ ngay dưới menu: danh sách hàng, giá, tăng/giảm số lượng, xóa, tạm tính và nút “Tiến hành thanh toán” sang checkout riêng. Đóng bằng X, Escape hoặc bấm ngoài; Escape trả focus về icon. Mobile dùng panel vừa chiều ngang màn hình và cuộn bên trong nếu nhiều hàng. Catalog chỉ giữ lịch sử đơn ở cuối trang. Khách xem lời mời đăng nhập trong dropdown trước khi được dẫn tới đăng nhập/xác minh. Sửa/xóa/đặt đơn cập nhật badge; lỗi tải giỏ hiển thị thông báo và nút thử lại, không giả thành giỏ trống.

1. Guest xem catalog; thêm giỏ yêu cầu login, quay lại sản phẩm sau login.
2. Customer chưa verify được hướng dẫn xác minh trước khi giỏ/checkout.
3. Checkout lấy giá hiện tại, hiển thị chính sách promo và tổng tính từ server sau đặt đơn.
4. Bấm đặt: tạo một Idempotency-Key cho một lần xác nhận, disable nút khi pending; network retry dùng cùng key/payload. Sửa payload hoặc xác nhận giá mới tạo key mới.
5. PRICE_CHANGED: hiện giá cũ/mới và yêu cầu xác nhận lại; OUT_OF_STOCK: chỉ rõ dòng thiếu, không tự đổi quantity âm thầm.
6. Thành công mở chi tiết đơn; nút “Thanh toán mô phỏng” ghi rõ demo. Hiển thị mốc nhắc 30 phút và hết hạn 60 phút.
7. Chỉ hiện action hợp lệ theo state; 409 do thay đổi đồng thời tải lại đơn và giải thích.
8. Trang theo dõi hiện realtime connected/reconnecting/polling, thời điểm cập nhật; cập nhật timeline theo version, không thêm event trùng.
9. Invoice chưa khả dụng trước payment; sau PAID có pending/refresh; failed không hiện link hỏng.

## 3. Kho

Xem đơn CONFIRMED → mở chi tiết → chọn PROCESSING → SHIPPING → DELIVERED. Mỗi thao tác có pending state; status/version response là nguồn cập nhật. Không cho nhập trạng thái tự do.

Điều chỉnh tồn: hiển thị onHand/reserved/available, nhập delta và lý do, xác nhận giá trị trước/sau. Server conflict thì tải lại, không tự áp delta lần hai. Lịch sử hiển thị actor và lý do.

## 4. CSKH và Gemini

Ticket queue → claim → mở conversation → xem nhãn AI có badge nguồn AI/HUMAN và cần review → mở assistant.

AI panel gồm prompt text, answer, evidence tool và thời điểm tra cứu. Lời giải đáp chỉ là bản nháp; nút “Dùng làm câu trả lời” điền vào composer để support kiểm tra và bấm gửi. Không tự gửi.

Proposal hiện card riêng category cũ/mới, reason, hạn hiệu lực, Confirm/Reject. Confirm thành công cập nhật nhãn và đóng action; stale/expired hiển thị lý do, yêu cầu tạo lại. Nhấn confirm hai lần không tạo audit/action lặp.

AI unavailable vẫn đọc ticket, tra đơn thủ công trong context được phép và trả lời được. Không render markdown HTML tùy ý; sanitize link và escape nội dung.

## 5. Trạng thái dùng chung

Mỗi màn hình có loading, empty, validation error, dependency error và retry phù hợp. 429 hiển thị countdown từ Retry-After. 401 thử refresh một lần, thất bại về login; không tạo vòng lặp refresh. Mọi form có label, keyboard focus, disabled state và thông báo server dễ hiểu. Không hiển thị stack trace hoặc chi tiết SDK cho người dùng.
