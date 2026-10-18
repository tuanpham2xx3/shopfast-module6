# 01 — Đặc tả sản phẩm

## 1. Mục tiêu và phạm vi

REQ: ShopFast là backend thương mại điện tử có UI web phục vụ demo Module 6, gồm F01–F07. Khoảng 200.000 khách hàng là quy mô đối tượng phục vụ, không phải số người truy cập đồng thời.

DEC: phiên bản đầu là cửa hàng một đơn vị bán, một kho, tiền VND, sản phẩm không có biến thể. Không có thanh toán thật, vận chuyển thật, upload tệp, marketplace hay RAG/vector database. Email dùng adapter có triển khai gửi thật; đồng bộ đối tác dùng mock HTTP có lưu bằng chứng. Hóa đơn là PDF minh họa, không phải hóa đơn thuế điện tử.

DEC: kiến trúc monolith theo module, API và worker riêng. UI gồm khu khách hàng và khu nhân viên. Chat của ticket dùng hội thoại HTTP có nút tải mới; chỉ theo dõi đơn bắt buộc realtime.

## 2. Vai trò và quyền

Mỗi tài khoản có một vai trò. Public registration chỉ tạo CUSTOMER. Tài khoản nhân viên/admin tạo bằng seed trong v1; không có API tự nâng quyền.

| Hành động                      | Guest | Customer        | Support               | Warehouse | Admin |
| ------------------------------ | ----- | --------------- | --------------------- | --------- | ----- |
| Xem sản phẩm active            | Có    | Có              | Có                    | Có        | Có    |
| Giỏ hàng, đặt hàng, lịch sử    | Không | Của mình        | Không                 | Không     | Không |
| Theo dõi realtime              | Không | Đơn của mình    | Không                 | Không     | Không |
| Đọc đơn nghiệp vụ              | Không | Của mình        | Có, phục vụ ticket    | Có        | Có    |
| Đổi trạng thái xử lý/giao hàng | Không | Không           | Không                 | Có        | Có    |
| Sửa giá/danh mục/sản phẩm      | Không | Không           | Không                 | Không     | Có    |
| Điều chỉnh tồn                 | Không | Không           | Không                 | Có        | Có    |
| Tạo ticket và trả lời          | Không | Ticket của mình | Ticket được phân công | Không     | Có    |
| AI assistant                   | Không | Không           | Ticket được phân công | Không     | Có    |
| Queue, health chi tiết         | Không | Không           | Không                 | Không     | Có    |

Support chỉ tra đơn của chủ ticket đang xử lý qua AI. Trang tra cứu thủ công của support cũng yêu cầu ticket context hợp lệ. Admin truy cập toàn bộ nhưng vẫn có audit log cho thao tác ghi.

## 3. Xác thực

DEC: đăng ký bằng email/password, email chuẩn hóa trim/lowercase và unique; password 10–128 ký tự, hash bằng thuật toán dành cho password, không ghi log. Tài khoản chưa xác minh chỉ truy cập hồ sơ và luồng xác minh.

- Đăng ký thành công tạo session và trả access token giới hạn quyền, đồng thời đặt refresh cookie. UI có thể đi thẳng tới màn hình nhập mã mà không cần đăng nhập lại.
- Access JWT sống 15 phút; chứa subject, session ID, vai trò, thời hạn. Server kiểm tra trạng thái tài khoản/session khi truy cập endpoint bảo vệ.
- Refresh token ngẫu nhiên sống 7 ngày, chỉ lưu hash trong DB, đặt trong cookie HttpOnly; Secure trên HTTPS, SameSite=Lax. Rotate mỗi lần refresh; reuse thu hồi toàn bộ token trong family.
- Access token giữ trong memory của UI; refresh khôi phục sau reload. Logout thu hồi session; WebSocket của session bị ngắt.
- Cookie endpoints kiểm tra Origin theo allowlist và chống CSRF; không dùng wildcard origin cùng credentials.
- Mã xác minh email: 6 chữ số, TTL 10 phút, tối đa 5 lần thử/mã, gửi lại cách tối thiểu 60 giây; lưu hash, dùng một lần. Mã cũ bị vô hiệu khi gửi mã mới.
- Trả thông báo chung khi gửi mã để hạn chế dò email; không trả mã OTP qua API. SMTP lỗi không làm mất khả năng gửi lại.
- Quên mật khẩu không thuộc phạm vi v1; UI không hiển thị chức năng giả.

## 4. Catalog và giỏ hàng

- Sản phẩm gồm SKU unique, tên, mô tả text, ảnh URL, danh mục, thương hiệu, giá nguyên VND, active/inactive.
- Lọc AND theo category, brand, minPrice, maxPrice; sort `newest`, `price_asc`, `price_desc`; mặc định newest. Tie-break bằng ID để phân trang ổn định trong cùng dữ liệu.
- Page từ 1; pageSize mặc định 20, tối đa 100. Giá min không lớn hơn max. Sản phẩm inactive không xuất hiện công khai và không đặt được.
- Mỗi customer có một giỏ; quantity nguyên từ 1–99. Thêm cùng sản phẩm tăng quantity, không vượt 99.
- Giỏ không giữ tồn, giá hiển thị là giá hiện tại và có thể đổi trước checkout. Backend xác nhận lại cả giá lẫn tồn.
- DEC: phí vận chuyển và thuế demo bằng 0; tổng đơn = tổng dòng hàng − giảm giá. Không nhận tổng tiền từ client.

## 5. Đặt hàng và tồn kho

### 5.1 Trạng thái

| Từ              | Sang       | Chủ thể/điều kiện                                  |
| --------------- | ---------- | -------------------------------------------------- |
| PENDING_PAYMENT | CONFIRMED  | Customer xác nhận thanh toán mô phỏng cho đơn mình |
| PENDING_PAYMENT | CANCELLED  | Customer hủy hoặc admin hủy có lý do               |
| PENDING_PAYMENT | EXPIRED    | Worker sau 60 phút, chưa thanh toán                |
| CONFIRMED       | PROCESSING | Warehouse/Admin                                    |
| CONFIRMED       | CANCELLED  | Customer/Admin; chưa bắt đầu xử lý                 |
| PROCESSING      | SHIPPING   | Warehouse/Admin                                    |
| SHIPPING        | DELIVERED  | Warehouse/Admin                                    |

DELIVERED, CANCELLED, EXPIRED là cuối. Không nhảy trạng thái hoặc quay ngược. DEC: không hỗ trợ hủy khi PROCESSING, hoàn hàng hoặc hoàn tiền v1. Hủy đơn đã thanh toán trước PROCESSING chuyển payment sang REFUNDED bằng mô phỏng trong cùng transaction.

Payment có `UNPAID`, `PAID`, `REFUNDED`; chỉ thanh toán mô phỏng trong v1, UI phải ghi rõ. Không cho kho tự xác nhận đã thanh toán.

### 5.2 Checkout

1. Customer đã xác minh gọi duy nhất `POST /orders`, gửi danh sách `{productId, quantity, expectedUnitPrice}`, địa chỉ nhận snapshot, điện thoại và `promoCode` tùy chọn; header Idempotency-Key bắt buộc. Request có promoCode chịu thêm limiter khuyến mãi.
2. Validate đầu vào, gộp/cấm dòng trùng: DEC cấm duplicate productId, tối đa 50 dòng. Chỉ đặt các dòng request, không mặc nhiên đặt cả giỏ.
3. Transaction khóa tồn các sản phẩm theo thứ tự ID để giảm deadlock; khóa/ràng buộc quota khuyến mãi nếu có.
4. Kiểm tra active, giá server bằng expectedUnitPrice và `available = onHand − reserved >= quantity`. Giá đổi trả 409 PRICE_CHANGED, không tạo đơn; trả giá mới để khách xác nhận lại.
5. Tạo đơn PENDING_PAYMENT, dòng hàng snapshot tên/SKU/giá, reservation ACTIVE, tăng reserved. Chốt giảm giá và tiêu hao quota promo tại đây.
6. Ghi status history, outbox cho email tiếp nhận đơn, đồng bộ tồn, nhắc thanh toán và hết hạn. Chưa tạo invoice khi đơn chưa thanh toán. Cập nhật các dòng giỏ được mua: trừ quantity đã đặt, xóa nếu còn 0; dòng không đủ quantity trong giỏ chỉ xóa, không ảnh hưởng đơn.
7. Commit toàn bộ hoặc rollback toàn bộ; response không chờ email/PDF/Gemini. Xử lý nhất quán cache theo tài liệu 04.

Không dùng cache làm nguồn xác nhận giá, tồn hoặc quota. Transaction lỗi giữa chừng không có đơn dở dang, không giữ tồn thừa và không phát sự kiện thành công.

### 5.3 Vòng đời tồn

- `onHand >= 0`, `reserved >= 0`, `reserved <= onHand`; available là trường tính toán.
- Checkout: tăng reserved. Thanh toán không đổi tồn.
- Shipping: trừ onHand và reserved đúng một lần, reservation ACTIVE → CONSUMED.
- Cancel/expire: trừ reserved đúng một lần, reservation ACTIVE → RELEASED; không tăng onHand vì chưa xuất kho.
- Warehouse điều chỉnh delta onHand có lý do, cấm kết quả nhỏ hơn reserved. Ghi inventory movement và outbox.
- Mỗi thay đổi có khóa nghiệp vụ unique; retry không trừ/hoàn tồn lần hai.
- Pay, expire, cancel và kho đổi trạng thái phải khóa cùng đơn; chỉ một transition thắng. Request dùng version cũ trả 409 VERSION_CONFLICT.

### 5.4 Khuyến mãi tối thiểu

DEC bổ sung để có luồng đặt đơn khuyến mãi theo F03: cùng endpoint checkout, nhưng request có promoCode chịu limiter riêng chặt hơn. Promo fixed amount, startsAt/endsAt, minOrderAmount, totalQuota và mỗi customer tối đa một lần. Không stacking; discount không vượt subtotal. Quota được tiêu hao khi tạo đơn thành công và không hoàn khi hủy/hết hạn trong v1. Điều kiện và chính sách này hiển thị trên UI.

### 5.5 Idempotency

- Key 8–128 ký tự, scope `(userId, route, key)`, giữ 24 giờ; so sánh hash payload chuẩn hóa.
- Cùng key và cùng payload trả lại status/body thành công trước đó, không tạo đơn/job mới. Khác payload trả 409 IDEMPOTENCY_CONFLICT.
- Request đang xử lý trả 409 REQUEST_IN_PROGRESS kèm thời gian retry. Không cache lỗi validation thành kết quả thành công.
- Bản ghi idempotency, đơn và outbox phải commit nguyên tử. Retry sau crash đọc được kết quả đã commit.

## 6. Ticket và hỗ trợ

- Customer tạo ticket với subject 5–150 ký tự, nội dung 1–4000 ký tự, orderId tùy chọn nhưng phải thuộc mình.
- Ticket `OPEN → IN_PROGRESS → RESOLVED → CLOSED`; customer có thể reopen RESOLVED → OPEN trong 7 ngày, CLOSED không reopen.
- Support claim ticket chưa ai nhận bằng cập nhật có điều kiện; chỉ người được gán hoặc admin xử lý. Customer chỉ đọc/gửi message trên ticket của mình chưa CLOSED.
- Mỗi message gắn author và timestamp; không sửa/xóa lịch sử qua UI v1. Không render HTML từ message/AI.
- Phân loại Gemini chạy nền; lỗi AI vẫn tạo ticket thành công và gán OTHER/NEEDS_REVIEW. Người hỗ trợ sửa nhãn được, lưu nguồn HUMAN.
- AI là trợ lý nhân viên, không tự chat thay nhân viên với customer. Câu trả lời đề xuất chỉ gửi cho customer khi nhân viên bấm gửi.
- Khi ticket không gắn orderId, tool AI có thể nhận orderCode nhưng backend chỉ trả đơn thuộc customer sở hữu ticket. Model không được cung cấp customerId và không thể mở rộng phạm vi bằng prompt.

## 7. Quy tắc chung

- Tất cả thời gian lưu UTC; lịch nghiệp vụ và UI theo Asia/Bangkok.
- Tiền dùng số nguyên VND; không dùng float tính tiền.
- Không hard-delete sản phẩm có giao dịch; dùng inactive. Snapshot đơn giữ nguyên khi catalog đổi.
- Mọi thay đổi trạng thái, tồn, giá và quyết định AI ghi audit: actor, action, entity, before/after phù hợp, requestId, timestamp; không lưu secret.
- Nội dung log che email/điện thoại/địa chỉ khi không cần; không đưa JWT, OTP, Gemini key vào log.
