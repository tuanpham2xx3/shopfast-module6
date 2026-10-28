# 03 — HTTP API contract

## 1. Quy ước chung

Base path `/api/v1`. JSON UTF-8, timestamp ISO-8601 UTC, Bearer JWT cho endpoint bảo vệ. DTO whitelist, reject field lạ; query validate trước khi truy vấn. Pagination `{items, page, pageSize, total}`. Sort allowlist, mọi query tham số hóa. Body tối đa 64 KB, AI message 4000 ký tự; không upload tệp v1.

Response thành công `{data, requestId}`; list data chứa pagination. Lỗi:

```json
{
  "error": {
    "code": "OUT_OF_STOCK",
    "message": "Sản phẩm không còn đủ số lượng.",
    "details": [{ "productId": "uuid", "available": 0 }]
  },
  "requestId": "uuid"
}
```

400 input sai; 401 chưa xác thực/token hết hạn; 403 sai role/chưa verify; 404 không tồn tại hoặc tài nguyên của customer khác; 409 xung đột nghiệp vụ/version/idempotency; 429 hạn mức; 503 dependency không thể phục vụ. Không trả stack trace, SQL, prompt nội bộ.

Endpoint tạo trả 201; read/update/action trả 200; logout/delete cart item trả 204 không body. Retry-After dùng giây trên 429/REQUEST_IN_PROGRESS. Thêm X-Request-Id cho mọi response.

## 2. Auth

| Method/path                     | Quyền         | Input → output                                                                                                                               |
| ------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| POST /auth/register             | Public        | email, password, displayName → accessToken giới hạn, expiresIn, user, verificationRequired; đặt refresh cookie và tạo email verification job |
| POST /auth/login                | Public        | email, password → accessToken, expiresIn, user; đặt refresh cookie                                                                           |
| POST /auth/refresh              | Cookie        | rotate token → accessToken, expiresIn; đặt cookie mới                                                                                        |
| POST /auth/logout               | Cookie/Bearer | thu hồi session, xóa cookie                                                                                                                  |
| GET /auth/me                    | Auth          | user ID, email, role, verified, displayName                                                                                                  |
| POST /auth/verification/send    | Public        | email → thông báo chung, 202                                                                                                                 |
| POST /auth/verification/confirm | Auth          | code → verified user                                                                                                                         |

Login sai email/password trả cùng thông báo. User DISABLED không đăng nhập/refresh được. Login của user chưa verify trả access nhưng chỉ được dùng auth/me, confirm/send và logout.

## 3. Catalog / inventory

Triển khai bổ sung: product detail/list có `inventoryVersion` để kiểm tra race cache. Mutation catalog/kho/đơn có thể trả `cacheInvalidationPending=true` khi DB đã commit nhưng Redis chưa vô hiệu hóa được; API bypass các tag liên quan và outbox retry. Các response này vẫn là thành công nghiệp vụ, không yêu cầu client gửi lại thao tác ghi bằng key mới.

| Method/path                                  | Quyền           | Contract                                                                           |
| -------------------------------------------- | --------------- | ---------------------------------------------------------------------------------- |
| GET /categories                              | Public          | danh mục active                                                                    |
| GET /brands                                  | Public          | thương hiệu active                                                                 |
| GET /products                                | Public          | categoryId, brandId, minPrice, maxPrice, sort, page, pageSize                      |
| GET /products/:id                            | Public          | id, sku, name, description, imageUrl, category, brand, price, available, version   |
| POST /admin/categories                       | Admin           | name, slug → category                                                              |
| PATCH /admin/categories/:id                  | Admin           | name/active, expectedVersion nếu version hóa                                       |
| POST /admin/brands                           | Admin           | name, slug → brand                                                                 |
| PATCH /admin/brands/:id                      | Admin           | name/active                                                                        |
| POST /admin/products                         | Admin           | sku, slug, name, description, imageUrl, categoryId, brandId, price; tồn ban đầu 0  |
| PATCH /admin/products/:id                    | Admin           | các field cho phép, expectedVersion bắt buộc                                       |
| GET /staff/inventory                         | Warehouse/Admin | sku, page, pageSize → onHand, reserved, available, version                         |
| POST /staff/inventory/:productId/adjustments | Warehouse/Admin | delta nguyên khác 0, reason 5–500 ký tự, expectedVersion; Idempotency-Key bắt buộc |
| GET /staff/inventory/:productId/movements    | Warehouse/Admin | lịch sử phân trang                                                                 |

Không có API sửa reserved trực tiếp. Không cho đổi SKU sau khi sản phẩm đã có order item. Category/brand inactive loại sản phẩm khỏi public listing và checkout; mutation phải vô hiệu detail/list cache liên quan theo file 04.

## 4. Cart / order / promotion

| Method/path                    | Quyền             | Contract                                                                                        |
| ------------------------------ | ----------------- | ----------------------------------------------------------------------------------------------- |
| GET /cart                      | Customer verified | items + giá hiện tại + available + subtotal                                                     |
| POST /cart/items               | Customer verified | productId, quantity; cộng quantity                                                              |
| PATCH /cart/items/:productId   | Customer verified | quantity; đặt tuyệt đối                                                                         |
| DELETE /cart/items/:productId  | Customer verified | xóa item của mình                                                                               |
| POST /orders                   | Customer verified | checkout; promoCode tùy chọn; Idempotency-Key. Khi có promoCode áp dụng thêm limiter khuyến mãi |
| GET /orders                    | Customer verified | status tùy chọn, page, pageSize; chỉ đơn mình                                                   |
| GET /orders/:id                | Customer verified | snapshot đơn, items, lịch sử, payment, version                                                  |
| POST /orders/:id/mock-payment  | Customer verified | expectedVersion; Idempotency-Key; chỉ đơn mình                                                  |
| POST /orders/:id/cancel        | Customer verified | reason, expectedVersion; Idempotency-Key                                                        |
| GET /orders/:id/invoice        | Customer verified | UNAVAILABLE trước payment; PENDING/READY/FAILED sau PAID; khi READY trả download URL có hạn     |
| GET /staff/orders              | Warehouse/Admin   | status, code, page, pageSize                                                                    |
| GET /staff/orders/:id          | Warehouse/Admin   | chi tiết cần cho vận hành                                                                       |
| PATCH /staff/orders/:id/status | Warehouse/Admin   | targetStatus, expectedVersion, reason tùy chọn; Idempotency-Key                                 |
| POST /admin/orders/:id/cancel  | Admin             | reason, expectedVersion; cùng state rule, không override vô điều kiện                           |
| POST /admin/promotions         | Admin             | code, amount, minOrderAmount, startsAt, endsAt, totalQuota                                      |
| PATCH /admin/promotions/:id    | Admin             | active; không sửa điều kiện đã có redemption                                                    |

Checkout request:

```json
{
  "items": [
    { "productId": "uuid", "quantity": 2, "expectedUnitPrice": 150000 }
  ],
  "shippingAddress": {
    "recipientName": "Nguyen Van A",
    "phone": "0900000000",
    "addressLine": "123 đường A",
    "ward": "Phường B",
    "province": "Thành phố C"
  }
}
```

recipientName 2–100 ký tự; phone 8–15 chữ số với dấu + đầu tùy chọn; addressLine 5–300, ward/province 1–100. Không giả định cấu trúc huyện cố định. Không cho client gửi customerId, status, discount, total.

Response checkout: id, code, status, paymentStatus, subtotal, discount, total, expiresAt, version. Response lỗi giá/tồn không tiết lộ thông tin khách khác. `PROMO_EXHAUSTED`, `PROMO_NOT_ELIGIBLE`, `INVALID_TRANSITION`, `VERSION_CONFLICT`, `PRICE_CHANGED`, `OUT_OF_STOCK` là mã ổn định.

## 5. Ticket / AI

| Method/path                              | Quyền                  | Contract                                                                                   |
| ---------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------ |
| POST /tickets                            | Customer verified      | subject, body, orderId optional → ticket OPEN, classification PENDING                      |
| GET /tickets                             | Customer verified      | ticket của mình                                                                            |
| GET /tickets/:id                         | Customer verified      | ticket + messages phân trang, chỉ của mình                                                 |
| POST /tickets/:id/messages               | Customer verified      | body; ticket chưa CLOSED                                                                   |
| POST /tickets/:id/reopen                 | Customer verified      | expectedVersion; RESOLVED trong 7 ngày                                                     |
| GET /staff/tickets                       | Support/Admin          | status, category, assignedTo, page, pageSize                                               |
| GET /staff/tickets/:id                   | Support/Admin          | support được xem ticket unassigned hoặc được gán mình; ticket người khác 403               |
| GET /staff/tickets/:id/order             | Assigned Support/Admin | đơn liên kết thuộc chủ ticket; dữ liệu tối thiểu cần hỗ trợ, không có đơn liên kết trả 404 |
| GET /staff/tickets/:id/orders/:orderCode | Assigned Support/Admin | tra đơn theo mã nhưng bắt buộc đơn thuộc customer sở hữu ticket; không tự liên kết ticket  |
| POST /staff/tickets/:id/claim            | Support/Admin          | expectedVersion; admin có thể gán agentId cụ thể                                           |
| POST /staff/tickets/:id/messages         | Assigned Support/Admin | body, approvedAiMessageId optional                                                         |
| PATCH /staff/tickets/:id                 | Assigned Support/Admin | status/category, expectedVersion; validate state machine                                   |
| POST /staff/tickets/:id/ai-sessions      | Assigned Support/Admin | tạo session → sessionId                                                                    |
| POST /staff/ai-sessions/:id/messages     | Owner Support/Admin    | message, clientMessageId UUID → answer, toolResults, proposal optional                     |
| POST /staff/ai-proposals/:id/confirm     | Proposal actor/Admin   | confirm=true, expectedVersion → kết quả thay đổi ticket                                    |
| POST /staff/ai-proposals/:id/reject      | Proposal actor/Admin   | reject → trạng thái REJECTED                                                               |

AI contract đầy đủ ở file 05. clientMessageId unique theo session để tránh lặp lượt khi UI retry. Confirm có transaction và dedup theo proposal ID; admin vẫn phải có quyền ticket hiện tại.

## 6. Operations

| Method/path                       | Quyền                        | Contract                                                                             |
| --------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------ |
| GET /health/live                  | Public                       | process alive, không lộ topology                                                     |
| GET /health/ready                 | Public/internal              | status ok/degraded/unavailable; 503 chỉ khi DB unavailable; không lộ chi tiết public |
| GET /admin/health                 | Admin                        | DB/Redis/queue/Gemini circuit trạng thái và thời gian kiểm tra                       |
| GET /admin/queues                 | Admin                        | waiting, active, completed, failed, delayed; data freshness                          |
| GET /admin/failed-jobs            | Admin                        | phân trang, loại, lý do đã che dữ liệu                                               |
| POST /admin/failed-jobs/:id/retry | Admin                        | giữ businessKey, audit, trả 202                                                      |
| GET /docs                         | Môi trường test có kiểm soát | OpenAPI sinh tự động, mô tả đủ auth/DTO/lỗi                                          |

Retry job không tạo lại email hoặc invoice đã hoàn tất. Nếu Redis lỗi dashboard báo unavailable, không hiển thị số 0 như thật.
