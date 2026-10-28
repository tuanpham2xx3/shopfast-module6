# 18 — Kịch bản bàn giao và bảo vệ ShopFast

Ngày: 28/10/2026 (Asia/Bangkok). Đây là kịch bản diễn tập, chưa phải bằng chứng người dùng đã diễn tập hoặc đạt Q&A. Không đánh PASS gate bảo vệ chỉ vì tài liệu này tồn tại.

## Mở đúng bằng chứng

- Ứng dụng: <https://shopfast.tuanpq.com>.
- Source: <https://github.com/tuanpham2xx3/shopfast-module6>.
- PR7: <https://github.com/tuanpham2xx3/shopfast-module6/pull/7>; CI ứng dụng: <https://github.com/tuanpham2xx3/shopfast-module6/actions/runs/40683340750>; deploy: <https://github.com/tuanpham2xx3/shopfast-module6/actions/runs/40683926118>.
- PR8 sửa công cụ kiểm chứng: <https://github.com/tuanpham2xx3/shopfast-module6/pull/8>; CI ứng dụng: <https://github.com/tuanpham2xx3/shopfast-module6/actions/runs/40689045694>; CI tài liệu: <https://github.com/tuanpham2xx3/shopfast-module6/actions/runs/40689045654>.
- [Chỉ mục evidence đã xuất bản](evidence/harness-evidence-index.md), [runbook](14-deployment-runbook.md), [kế hoạch đóng SRS](16-srs-completion-plan.md).

Tài khoản demo nhận qua kênh riêng; không đặt mật khẩu, OTP, API key hoặc terminal chứa `.env` lên màn hình trình chiếu. Dùng dữ liệu synthetic. Minh chứng phải giữ SHA thực thi, không đổi nhãn số liệu cũ thành số liệu release mới.

## Luồng trình bày 10 phút

| Thời gian   | Thao tác và nội dung                                                                    | Điều cần chứng minh                                                                              |
| ----------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 00:00–01:00 | Mở URL, nêu customer/support/warehouse/admin, giới thiệu kiến trúc module               | Bài toán mua hàng và hỗ trợ; ranh giới vai trò                                                   |
| 01:00–02:30 | Customer chọn sản phẩm, giỏ hàng, checkout; mở mã đơn                                   | Tổng tiền do server tính, giữ tồn trong transaction, idempotency chống tạo đơn lặp               |
| 02:30–03:30 | Warehouse đổi trạng thái; customer theo dõi; tắt mạng rồi bật lại                       | Room riêng theo ownership; reconnect và REST resync trạng thái cuối                              |
| 03:30–04:15 | Mở evidence cache/rate limit                                                            | Cache hit và p95 đo bằng harness; 429 có Retry-After; không spam đăng nhập live để trình diễn    |
| 04:15–06:15 | Support mở ticket; Gemini tra đơn/tồn; xem đề xuất; xác nhận một lần; hỏi ngoài phạm vi | Hai tool đọc DB; không ghi trước xác nhận; replay không gửi lại; refusal đúng phạm vi            |
| 06:15–07:15 | Admin mở queue dashboard, chỉ vào retry/dead letter; giải thích partner demo            | Tác vụ nền không chặn checkout; version/idempotency; không tuyên bố kết nối đối tác thật         |
| 07:15–08:30 | Mở PR/checks, release và rollback evidence                                              | SHA/image cụ thể, candidate health, active-session checks; phân biệt lỗi harness và lỗi ứng dụng |
| 08:30–09:30 | Mở backup/restore và performance evidence                                               | Restore vào DB clone, checksum PDF, thời gian thực đo; giới hạn môi trường tải                   |
| 09:30–10:00 | Nêu giới hạn và mục chưa nghiệm thu                                                     | Không giấu gate AWS/MFA, CI negative fixture, slide hay Q&A chưa hoàn tất                        |

Nếu Gemini hết quota hoặc lỗi mạng, trình bày kết quả smoke đã lưu theo SHA và trạng thái lỗi hiện tại; không giả đầu ra live. Hai key/model có quota độc lập nhưng mỗi model vẫn phải giữ giới hạn đã cấu hình. Không đổi mutation key để vượt replay guard. Nếu demo mất kết nối, mở evidence đã xuất bản và ghi rõ đang xem lần chạy trước.

## Bảy chủ đề tích hợp

| Chủ đề          | Chỗ tích hợp                                                       | Giải thích khi bảo vệ                                                                        |
| --------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| AI Agent        | Ticket, Gemini adapter, tool tra đơn/tồn, proposal và confirmation | Backend giữ key; kiểm ownership trên từng tool; model không có quyền tự ghi                  |
| Realtime        | Order gateway, private room, Redis và REST resync                  | Socket không phải source of truth; DB giữ trạng thái; kiểm token và quyền subscribe          |
| Rate limit      | Global và limiter nhạy cảm ở auth/promo                            | Tách account/IP; 429 tiếng Việt, Retry-After; không thay limiter để test xanh                |
| Cache           | Catalog, generation key, targeted invalidation                     | Chống stale write sau invalidation; không lấy cache để quyết định tồn/đơn                    |
| Background jobs | Transactional outbox, BullMQ, email/PDF/partner demo               | Job ID ổn định và consumer dedup; retry hữu hạn, dead letter; crash window được kiểm chứng   |
| Nghiệp vụ       | Checkout, reservation, promotion, order transitions                | Transaction và constraint bảo vệ race; snapshot giá; ownership phía server                   |
| Vận hành        | Health, metrics, queue UI, OpenAPI, backup                         | Dependency readiness khác liveness; backup phải restore thử; UI không thay bằng chứng DB/job |

## Q&A 5 phút và checklist diễn tập

1. Vì sao chọn monolith chia module? Để giữ transaction tồn/đơn/outbox trong một DB và giảm thành phần vận hành; API và worker vẫn có vòng đời riêng.
2. Crash sau gửi email trước đánh dấu xong thì sao? Giải thích idempotency phía provider và trạng thái delivery; chỉ dẫn tới test crash window thật, không hứa exactly-once tuyệt đối cho mọi provider.
3. Vì sao không HA khi deploy liên tục đạt? Hiện một EC2 là điểm lỗi đơn; test promotion/rollback không chứng minh chịu mất host hay cả vùng.
4. Vì sao MFA IAM bằng 0 chưa kết luận Builder ID không MFA? Nguồn danh tính là Builder ID qua Identity Center; cần evidence đúng nguồn và policy, không suy từ IAM user count.
5. Đối tác nào đang dùng? Đối tác demo có version/idempotency theo lựa chọn người dùng, không phải sandbox thương mại thật.

- [ ] Người dùng thực hiện đủ kịch bản, ghi thời điểm bắt đầu/kết thúc và phần vượt thời lượng.
- [ ] Mở được từng link evidence từ một phiên không có file `.secrets` của agent.
- [ ] Chỉ rõ expected/actual, SHA và giới hạn của từng kết quả.
- [ ] Người dùng tự trả lời Q&A và ghi câu chưa giải thích được.
- [ ] Deck có thể mở/xuất, có speaker notes; chưa có deck thì gate slide vẫn BLOCKED.

## Kiến trúc vận hành thực tế

Trình duyệt → HTTPS Nginx trên EC2 Sydney → NestJS API/Socket.IO → PostgreSQL16 và Redis7. API ghi order/reservation/outbox cùng transaction. Publisher chuyển outbox sang BullMQ; worker xử lý email/PDF/partner demo và gọi Gemini khi nghiệp vụ cần. Backend gọi Gemini/Resend; browser không nhận provider key. PostgreSQL/Redis chỉ bind loopback của host. Không có RDS, ALB hoặc cụm đa host trong kiến trúc hiện tại.

GitHub Actions build image theo SHA và đẩy GHCR public; job deploy nhận credential AWS ngắn hạn qua OIDC, gọi SSM document giới hạn tới instance. EC2 dùng instance role cho SSM và prefix backup S3. Timer backup hằng ngày gửi bản mã hóa tới S3; restore kiểm vào clone, không ghi đè DB live. DNS thuộc Cloudflare; kết quả HTTPS/redirect và TLS được kiểm riêng. Xem [kiến trúc module và dữ liệu](02-data-architecture.md) để đọc các quan hệ chi tiết.
