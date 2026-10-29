# 10 — Quyết định và phần hoãn

## 1. Decision log

### D29 — Chuẩn hóa theo trách nhiệm, giữ hợp đồng runtime

29/10/2026: người dùng yêu cầu hoàn tất plan cấu trúc và deploy sau kiểm chứng. Giữ monolith và API/schema; tách HTTP/application/persistence/composition, nhóm frontend/harness/deploy. Google provider được dựng trong composition, application nhận provider qua injection; default không cấu hình trả lỗi an toàn thay vì tự gọi Google. Production API/worker được wiring adapter Google như trước. Các entrypoint đã cài trên VPS giữ nguyên đường dẫn để SSM/systemd và rollback còn hoạt động. Test/evidence lịch sử không di chuyển hoặc sửa hash. Chi tiết ở [plan R0–R6](21-repository-refactor-plan.md).

| ID  | Quyết định                                                              | Nguồn/trạng thái                | Lý do                                                                       |
| --- | ----------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------- |
| D01 | Gemini Developer API, key Google AI Studio                              | Người dùng đã chọn              | Dịch vụ AI thống nhất                                                       |
| D02 | Hoãn quyết định hạ tầng                                                 | Người dùng đã chọn              | Tập trung spec ứng dụng trước                                               |
| D03 | Monolith chia module, API/worker riêng                                  | Đề xuất v1                      | Transaction đơn giản, vẫn tách tải nền                                      |
| D04 | TypeORM migrations; React/Vite UI                                       | Đề xuất v1                      | Phù hợp NestJS/Postgres và UI demo                                          |
| D05 | Payment mock, đơn giữ tồn ngay                                          | Đề xuất v1                      | Không có cổng thật, tránh oversell                                          |
| D06 | Reminder 30 phút, expiry 60 phút                                        | 30 phút từ SRS; 60 phút đề xuất | Có thời gian nhắc trước giải phóng tồn                                      |
| D07 | Promo fixed amount, quota không hoàn                                    | Đề xuất v1                      | Đủ demo endpoint nhạy cảm, rule xác định                                    |
| D08 | Cache invalidation theo product/tag, không dùng generation toàn catalog | Review 18/10/2026               | Checkout một SKU không phá hit ratio của toàn catalog                       |
| D09 | Outbox + consumer idempotency                                           | Đề xuất v1                      | Redis lỗi không mất sự kiện nghiệp vụ                                       |
| D10 | AI read tools + proposal đổi nhãn ticket                                | Đề xuất v1                      | Đủ demo agent/human confirmation, giới hạn tác động                         |
| D11 | Customer ticket chat HTTP; order Socket.IO                              | Đề xuất v1                      | Realtime tập trung đúng F02                                                 |
| D12 | Một kho, một seller, VND, không variants                                | Đề xuất v1                      | Giữ phạm vi phù hợp bài bảo vệ                                              |
| D13 | Một endpoint checkout, promoCode tùy chọn và limiter bổ sung            | Review 18/10/2026               | Một contract/idempotency path, vẫn đáp ứng F03                              |
| D14 | Register trả session giới hạn để xác minh OTP                           | Review 18/10/2026               | Luồng register → verify khép kín                                            |
| D15 | Invoice chỉ tạo sau PaymentConfirmed                                    | Review 18/10/2026               | Không phát hành PDF cho đơn chưa thanh toán/hết hạn                         |
| D16 | P0/P1/P2; service native local, Docker/VPS ở M8                         | Người dùng chọn 18/10/2026      | Tránh Docker Desktop/WSL tràn RAM; vẫn đáp ứng Docker ở môi trường bàn giao |
| D17 | PostgreSQL 16 native + Memurai Redis API v7 trên Windows                | Người dùng chọn 18/10/2026      | Dev nhẹ, không WSL; bắt buộc compatibility smoke và test lại Redis 7 thật   |

| D18 | Invoice local lưu PDF bytea riêng trong PostgreSQL, tải có bearer + HMAC hạn 5 phút | Baseline triển khai 18/10/2026 | Không cần chốt cloud storage; bảo toàn quyền và file khi restart |
| D19 | Gemini dùng REST generateContent chính thức qua adapter, model cấu hình backend | Baseline triển khai 18/10/2026 | Không phụ thuộc SDK; vẫn dùng Gemini API Google AI Studio |
| D20 | Câu trả lời factual AI render từ evidence DB của lượt hiện tại | Baseline triển khai 18/10/2026 | Không dùng prose của model tự khai claims để chứng minh tính đúng |
| D21 | Implement toàn bộ ứng dụng trước; nghiệm thu Redis/Gemini/email thật sau | Người dùng chọn 18/10/2026 | Không chặn code do service/key local chưa sẵn sàng |
| D22 | Retention AI 30 ngày; job thành công thu gọn payload sau 90 ngày, giữ tombstone chống chạy trùng | Baseline triển khai 19/10/2026 | Không xóa phản hồi khách/audit; cleanup có batch, advisory lock và không phụ thuộc Redis |

### D23 — UI refresh 28/10/2026

Người dùng yêu cầu cải thiện UI/UX và tải ảnh mạng về dự án. Giữ thương hiệu xanh ShopFast, typography Be Vietnam Pro tự host, token sáng/tối đồng bộ, native form controls và breakpoint responsive. Lựa chọn theme lưu localStorage dưới key `shopfast:theme`. Ảnh demo tải về public assets, có nguồn/giấy phép và nhãn minh họa; ưu tiên imageUrl hợp lệ của catalog, dùng ảnh local cho seed Audio khi URL mẫu thiếu/hỏng. Không sửa tên trường hoặc giới hạn nghiệp vụ. Chi tiết audit và evidence trong [UI refresh](15-ui-refresh.md).

Những DEC được dùng để tạo bản spec cụ thể, có thể sửa khi review; không phải tuyên bố người dùng đã xác nhận tất cả lựa chọn.

## 2. Những việc hạ tầng chưa chốt

Cập nhật 28/10/2026: người dùng đã mở giai đoạn AWS, tự tạo EC2 và cho phép agent setup baseline qua SSH. Plan end-to-end và các quyền/đầu vào ngoài đang chờ ở [docs13](13-end-to-end-delivery-plan.md). Các đoạn hoãn bên dưới là baseline lịch sử; không có nghĩa được bỏ nghiệm thu hạ tầng hoặc tự tạo tài nguyên ngoài phạm vi được cấp.

Chưa chọn instance/region, ngân sách, domain, DNS/TLS, registry, storage file, email provider, metrics platform hay phương thức deployment. Không cần mua/tạo tài nguyên để hoàn thành giai đoạn viết spec. Docker không được khởi động/cài trên workstation; chỉ cấu hình khi tới VPS/CI hoặc môi trường Linux được người dùng yêu cầu.

Các yêu cầu gốc vẫn bắt buộc cho nghiệm thu cuối:

- AWS EC2, Nginx HTTPS/HTTP redirect, PostgreSQL/Redis mạng nội bộ.
- Docker images và Compose; image tag theo commit SHA.
- GitHub PR và CI kiểm tra format, unit, integration; chặn merge khi fail.
- Cloud credentials tạm thời qua role, least privilege, MFA và secret không nằm trong code.
- Deploy không gián đoạn, hoàn thành <10 phút; health check và rollback <2 phút.
- Daily DB backup ngoài máy app, diễn tập restore <30 phút.
- Domain chạy thật, kiến trúc AWS/data-flow, pipeline evidence, coverage report, restore report, README và slide/demo.

Thiết kế sau phải xử lý migration tương thích khi chạy hai version, file invoice không mất khi container thay, reconnect WebSocket khi deploy, cùng với backlog queue. Backup target/RPO chưa được SRS định lượng; phải chốt trong deployment spec, không tự coi daily backup tương đương không mất dữ liệu.

## 3. Rủi ro cần theo dõi

### D26 — Chuẩn hóa module và composition root

28/10/2026: theo yêu cầu chuẩn hóa cấu trúc dự án, source mỗi feature nằm trong `libs/modules/<feature>/src`. Worker orchestration chuyển từ platform về `apps/worker/src`; platform không phụ thuộc nghiệp vụ. Thêm architecture check vào CI. Không đổi contract HTTP/socket, database schema, quyền, transaction hoặc khóa idempotency. Xem [cấu trúc repository](19-repository-structure.md).

### D27 — URL thật cho các màn hình frontend

29/10/2026: người dùng yêu cầu triển khai bản đồ route của spec. Dùng React Router DOM 7.18.5 (React18/Node20), BrowserRouter declarative theo [tài liệu chính thức](https://reactrouter.com/7.18.5/start/declarative/installation), giữ ứng dụng SPA hiện có. Route/detail IDs và query catalog là nguồn lựa chọn màn hình. Guard đợi session restore, giữ return URL nội bộ qua login/verify và phân quyền trước khi mount component; server tiếp tục kiểm quyền và ownership. Sản phẩm giữ popup có URL, giỏ giữ dropdown. Loại proxy HTTP `/orders/` của Nginx để nhường deep link FE; Socket.IO tiếp tục đi `/socket.io/` với namespace `/orders`. Không đổi API, database, transaction/idempotency hoặc provider.

### D28 — Dọn giao diện theo tác vụ

29/10/2026: theo yêu cầu bớt nội dung thừa, `/` vào `/products`, auth dùng trang riêng; metadata, JSON và chứng cứ công cụ có disclosure; nhãn enum dịch ở presentation layer và option giữ value gốc. Không thay provider, API, transaction, ownership hoặc human confirmation. Xem [audit và thay đổi UI](15-ui-refresh.md).

### D25 — Đối tác tồn kho demo được người dùng chấp thuận

28/10/2026: người dùng xác nhận “Không có, dùng đối tác demo”. Nghiệm thu luồng `inventory.partner-sync` với `partner_inventory` mô phỏng có version và business key; ghi rõ đây là demo trong API/dashboard/report/slide. Không yêu cầu credential/endpoint đối tác thật và không tuyên bố đã gửi dữ liệu ra bên thứ ba. Vẫn kiểm queue không chặn checkout, retry/dedup và snapshot cũ không ghi đè mới. Gate `partner-http-contract` trước đây đổi thành `partner-versioned-demo`; không suy việc người dùng chấp thuận thành test đã PASS.

### D24 — Nginx graceful reload giữ HTTP keep-alive tối thiểu

Rehearsal active session28/10/2026 phát hiện `UND_ERR_SOCKET` khi reload dù health/deploy/rollback đều đạt. Dùng Nginx1.28 runtime, thêm `keepalive_min_timeout 5s` và `keepalive_timeout 10s`; minimum giữ kết nối cho request reuse lúc graceful shutdown, thấp hơn thời gian drain API15s. Không retry request để che lỗi. Chỉ đóng gate zero-downtime khi rehearsal có authenticated browser/order reads/socket đạt; từng lần FAIL giữ riêng. Directive yêu cầu Nginx>=1.27.4 theo [tài liệu chính thức](https://nginx.org/en/docs/http/ngx_http_core_module.html#keepalive_min_timeout).

| Rủi ro                                               | Cách xử lý                                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Email duplicate sau crash                            | Chọn provider có idempotency/status lookup; test crash window                        |
| Reverse index cache thiếu key hoặc invalidation race | Atomic write/index, version check trên miss, outbox retry và bypass phạm vi bị lỗi   |
| Gemini model/quota thay đổi                          | Model config, provider adapter, fake tests và smoke test thật                        |
| Redis vừa cache vừa queue/limiter                    | Outbox và fallback; cấu hình eviction/persistence tách vai trò khi thiết kế vận hành |
| Memurai local khác Redis 7 trên VPS                  | Contract smoke ở M0 và chạy lại integration suite với Redis 7 thật trước nghiệm thu  |
| Snapshot đơn sai khi sản phẩm đổi                    | Lưu snapshot trong transaction checkout                                              |
| AI truy cập đơn người khác                           | Ticket context do server dựng, allowlist tools và kiểm tra quyền từng call           |
| Test đạt local nhưng không đạt cloud                 | Chạy lại performance/restore/deploy trên môi trường đích                             |
