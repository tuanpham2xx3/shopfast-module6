# 04 — Realtime, cache, rate limit và jobs

Các giá trị TTL, retry, limiter dưới đây là DEC có thể cấu hình, không phải số liệu nguyên văn SRS.

## 1. Realtime tracking

- Socket.IO namespace `/orders`; token trong handshake auth, không truyền trên URL query. Validate JWT/session/verified tại handshake; token hết hạn thì disconnect, UI refresh rồi kết nối lại.
- Client gửi `order.subscribe {orderId}`. Server truy vấn DB xác nhận chủ đơn rồi join room nội bộ `order:<id>`; không chấp nhận tên room từ client. Ack `{ok, orderId, currentVersion}` hoặc lỗi chung NOT_FOUND/FORBIDDEN.
- `order.unsubscribe {orderId}` rời room; đóng màn hình phải unsubscribe. Tối đa 10 subscriptions/socket, 5 sockets/session và 30 subscribe attempts/phút/session.
- Event `order.status.updated` chỉ phát sau commit, đến room tương ứng; không broadcast global. Không gửi địa chỉ/điện thoại trong event.

```json
{
  "eventId": "uuid",
  "orderId": "uuid",
  "status": "SHIPPING",
  "version": 4,
  "occurredAt": "2026-10-18T08:00:00Z"
}
```

- Sau subscribe ack, UI GET chi tiết đơn; buffer event trong lúc fetch rồi chỉ áp dụng version mới hơn. Event trùng/cũ bị bỏ qua. Nhảy version thì GET lại snapshot.
- Reconnect exponential backoff có jitter từ 1 đến 30 giây, tự subscribe lại và REST resync. Khi realtime unavailable UI hiển thị trạng thái kết nối, polling 10 giây trong lúc màn hình đang mở.
- Đổi chủ tài khoản/logout/revoke session phải ngắt socket và xóa subscription. Server kiểm tra session còn hiệu lực khi subscribe và định kỳ mỗi 30 giây; sự kiện thu hồi qua kênh nội bộ giúp ngắt sớm.
- Transaction outbox bảo đảm có sự kiện sau commit; fast-path publish sau commit giúp giảm trễ, outbox bổ sung khi fast-path lỗi. eventId giống nhau để client dedup.
- Không thể bảo đảm SLA realtime khi Redis/gateway mất kết nối; đây là chế độ degraded có resync, phải kiểm thử riêng.

## 2. Cache catalog

### 2.1 Consistency

REQ không trả giá cũ sau cập nhật. DEC dùng invalidation theo phạm vi thay vì một generation toàn catalog:

1. Key ổn định: `catalog:product:<id>` và `catalog:list:<hash-normalized-query>`. Value chứa `productVersion`/`inventoryVersion` và thời điểm tạo.
2. Redis giữ reverse index `catalog:index:product:<id>` chứa các list key đã đưa product đó vào. List key đồng thời nằm trong index category/brand tương ứng. Index có TTL dài hơn cache data và được dọn cùng mutation.
3. Mutation DB ghi outbox gồm productId, categoryId/brandId cũ và mới, productVersion/inventoryVersion. Sau commit, API thực hiện invalidation đồng bộ cho detail và các list key liên quan trước khi trả thành công; outbox retry nếu lần đồng bộ thất bại.
4. Cache miss đọc DB cùng version. Trước khi ghi Redis, loader đọc lại version của đúng product trong DB; version đổi thì bỏ kết quả và retry một lần. List loader đăng ký reverse index bằng thao tác Redis atomic cùng lúc ghi cache.
5. Nếu invalidation đồng bộ không hoàn tất, mutation vẫn đã commit nhưng response trả trạng thái thành công kèm `cacheInvalidationPending=true`; API chuyển catalog reads sang bypass cache cho các product/tag liên quan đến khi worker xác nhận invalidation. Với một API instance v1 trạng thái bypass nằm trong process và outbox; khi scale nhiều instance phải dùng control plane dùng chung.
6. Không dùng `KEYS` hoặc xóa toàn namespace. Checkout chỉ vô hiệu cache của các sản phẩm trong đơn; thay đổi một SKU không làm mất cache của toàn catalog.

Định nghĩa freshness: request catalog bắt đầu sau khi mutation trả thành công không được nhận version cũ. Request chồng lấn trước thời điểm đó có thể hoàn tất với snapshot trước commit. Cache hit không đọc PostgreSQL; chỉ cache miss/race mới kiểm tra DB version. Phải đo mục tiêu <20 ms lần hai và p95 <50 ms.

### 2.2 Chính sách

- Product TTL 300 giây ±20% jitter; list TTL 60 giây ±20%; negative cache 15 giây. Chỉ cache GET public thành công và not-found hợp lệ, không cache lỗi dependency.
- Query canonical: defaults tường minh, sort field order, chỉ allowlisted filters. Giới hạn pageSize và phạm vi page để hạn chế tạo vô hạn key.
- Hot key lock `SET NX PX` 3 giây với owner token; release bằng compare-and-delete. Waiter đợi ngắn tối đa 100 ms rồi đọc DB có concurrency limit, không khóa request vô hạn.
- Redis timeout ngắn, circuit breaker và fallback DB; không trả stale price chỉ để che outage. Có bulkhead/semaphore bảo vệ DB; quá tải trả 503 có retry guidance.
- Metrics hit/miss/error, invalidation latency/error, DB fallback và lock contention. Không dùng user/private endpoint chung cache catalog.

## 3. Rate limiting và chống dò mật khẩu

| Scope                 | Hạn mức đề xuất                                                 |
| --------------------- | --------------------------------------------------------------- |
| API public            | 60 request/phút/IP                                              |
| API authenticated     | 120 request/phút/user                                           |
| Login                 | 5 request/phút/IP, cộng bảo vệ tài khoản mục tiêu               |
| Gửi mã xác minh       | 3 request/15 phút/email hash và 10/15 phút/IP; cooldown 60 giây |
| Checkout thường       | 10/phút/user                                                    |
| Checkout có promoCode | 3/phút/user, cộng limiter checkout thường                       |
| AI assist             | 10/phút/staff và tối đa 1 lượt đang chạy/session                |

Limiter nhạy cảm áp dụng cộng với global. Auth chạy trước khi xác định user key; guest dùng trusted client IP. Chỉ tin forwarded header từ proxy đã cấu hình, không tin X-Forwarded-For tùy ý.

DEC dùng cửa sổ trượt với cập nhật atomic Redis. Login sai đếm theo normalized email hash trên cửa sổ 30 phút: 5 lần khóa 1 phút, 10 lần khóa 5 phút, 15 lần khóa 30 phút. Không lộ tài khoản tồn tại; login thành công xóa failure count. UI hiển thị thông báo chung tránh tiết lộ mục tiêu bị tấn công.

429 có `Retry-After`, JSON `RATE_LIMITED`, thông điệp “Bạn thao tác quá nhanh. Vui lòng thử lại sau … giây.”

Redis down: catalog fallback DB; limiter thường dùng in-memory conservative fallback từng process và báo degraded; login/OTP/promo dùng bộ đếm PostgreSQL atomic để giữ bảo vệ liên process. Nếu cả limiter authoritative không hoạt động thì từ chối endpoint nhạy cảm bằng 503. Bảng `security_counters(scope, subjectHash, windowStart, count, blockedUntil)` có unique scope/subjectHash/windowStart và cleanup TTL.

## 4. Outbox và job contracts

Event envelope `{eventId, type, aggregateId, aggregateVersion, occurredAt, payload}`. Payload chỉ ID/snapshot tối thiểu cần thiết; worker nạp lại dữ liệu có kiểm soát. Outbox record availableAt hỗ trợ tác vụ hẹn giờ; publisher polling tối đa 250 ms khi healthy để phục vụ realtime, batch có giới hạn.

| Job                      | Business key                           | Trigger             | Retry tối đa tổng số lần chạy |
| ------------------------ | -------------------------------------- | ------------------- | ----------------------------- |
| email.order-confirmation | email:order:<orderId>                  | OrderCreated        | 5                             |
| invoice.generate         | invoice:<orderId>:v1                   | PaymentConfirmed    | 3                             |
| inventory.partner-sync   | partner:<productId>:<inventoryVersion> | InventoryChanged    | 5                             |
| payment.remind           | reminder:<orderId>:30m                 | createdAt + 30 phút | 3                             |
| order.expire             | expire:<orderId>                       | createdAt + 60 phút | 5                             |
| ticket.classify          | classify:<ticketId>:v1                 | TicketCreated       | 3                             |
| email.verification       | verify:<verificationId>                | Mã xác minh tạo     | 3                             |
| revenue.daily            | revenue:<businessDate>                 | 00:10 Asia/Bangkok  | 3                             |

Backoff exponential với jitter, base 2 giây, cap 60 giây. Lỗi permanent input/authorization không retry vô nghĩa. Scheduler nhiều instance dùng unique businessKey/DB claim, không dựa chỉ vào timer trong memory. Sau worker restart có catch-up reminder/expiry/report bị lỡ.

### 4.1 Idempotency và lỗi ngoài DB

- Consumer claim `job_executions` có lease; DONE bỏ qua, lease hết hạn được nhận lại. Không giữ transaction DB trong lúc gọi dịch vụ mạng.
- Invoice chỉ tạo khi payment PAID/order CONFIRMED, ghi storage key ổn định, checksum và unique order/version; upload lại không tạo nhiều bản công khai. Đơn UNPAID/CANCELLED/EXPIRED không có invoice.
- Partner mock nhận idempotency key và inventoryVersion, chỉ nhận version mới hơn; request cũ không ghi đè tồn mới.
- Email adapter phải hỗ trợ idempotency key hoặc tra trạng thái gửi theo key để xử lý crash sau provider đã nhận nhưng DB chưa đánh dấu. SMTP đơn thuần không bảo đảm exactly-once; khi chọn provider phải chứng minh được contract này. Chưa chọn provider không được tuyên bố đạt tiêu chí chỉ một email.
- Reminder kiểm tra đơn vẫn PENDING_PAYMENT ngay trước gửi; nếu đã trả tiền/hủy/hết hạn thì SKIPPED. Có thể gửi nếu payment commit trong lúc provider đang gửi; test phân biệt thời điểm check và không cam kết atomic giữa DB và email provider.
- Expiry khóa order và cùng transition service như API; không trừ reserved lần hai.
- Doanh thu ngày = tổng tiền đơn DELIVERED có thời điểm delivered trong ngày nghiệp vụ; không tính CANCELLED/EXPIRED. Report ghi kỳ và formula rõ ràng, xuất CSV và email link cho admin.

### 4.2 Dead letter và khôi phục

Hết attempts: ghi failed_jobs riêng với reason đã che dữ liệu, giữ job failed trong BullMQ để dashboard; nếu ghi archive lỗi thì retry bước archive, không mất dấu thất bại. Admin retry giữ businessKey, thêm attempt/audit, không xóa lịch sử. Chỉ retry sau kiểm tra nguyên nhân; job đã DONE trả kết quả đã có.

Redis unavailable: API nghiệp vụ vẫn commit đơn/outbox; UI báo tác vụ phụ đang chờ. Publisher/worker phục hồi sẽ drain backlog. Nếu DB unavailable thì không nhận tạo đơn hoặc xác nhận thành công giả.
