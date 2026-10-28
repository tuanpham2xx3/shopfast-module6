# 07 — Kế hoạch triển khai theo mốc

Roadmap ưu tiên có một vertical slice chạy được sớm, sau đó bổ sung các chủ đề Module 6. Hạ tầng cloud và Docker nằm cuối theo chỉ dẫn người dùng. Máy phát triển Windows dùng service native, không khởi động Docker Desktop hoặc WSL.

## 1. Mức ưu tiên

Checkpoint cập nhật: code M4–M6 đã được tích hợp ở `feat/complete-application`, gồm jobs/invoice, realtime, cache/limiter, ticket/Gemini và UI các vai trò. Kết quả kiểm tra và giới hạn hiện tại ở [application-completion](evidence/application-completion.md). Nghiệm thu Redis/provider thật, hiệu năng/coverage và M8 vẫn chưa đạt/đang hoãn; không dùng các dòng trạng thái lịch sử bên dưới làm kết luận nghiệm thu mới nhất.

Tiến độ thực tế 18/10/2026: M0 đã qua CI PostgreSQL16/Redis7; Memurai local vẫn chưa sẵn sàng. M1 auth, M2 catalog/kho và M3 luồng mua hàng cơ bản đã có code/evidence, browser thật chạy đến DELIVERED. M2 admin editor UI và các hardening/UI mở rộng còn thiếu. M4 jobs/realtime, M5 cache/limiter đầy đủ, M6 ticket/Gemini và M7 nghiệm thu toàn bộ chưa hoàn thành. Xem `docs/evidence/m1-auth.md`, `m2-catalog.md`, `m3-orders.md` trước khi tiếp tục.

| Mức               | Ý nghĩa                                                       | Điều kiện                                         |
| ----------------- | ------------------------------------------------------------- | ------------------------------------------------- |
| P0 — Defense core | Đường chạy chính để minh họa từng F01–F07                     | Không cắt nếu chưa có quyết định thay đổi phạm vi |
| P1 — Reliability  | Chống race, retry, duplicate, outage và kiểm tra quyền        | Hoàn thành trước nghiệm thu cuối                  |
| P2 — Hardening    | Nâng chất lượng production nhưng không chặn vertical demo đầu | Thực hiện sau P0/P1 hoặc khi còn thời gian        |

Các DEC vẫn là baseline thiết kế, nhưng roadmap không coi mọi hardening là điều kiện để bắt đầu luồng tiếp theo. Mỗi mốc ghi rõ gate tối thiểu; acceptance cuối vẫn bám SRS.

## M0 — Foundation và môi trường local

Trạng thái 18/10/2026: đang triển khai trên `feat/m0-foundation`; xem [evidence M0](evidence/m0-progress.md). PostgreSQL native và nền tảng API/worker/web đã có; Redis/BullMQ native và audit dependency còn chờ nghiệm thu.

**P0**

- Tạo branch triển khai riêng; không làm trực tiếp trên `main` của repository cha.
- Tạo workspace theo file 02, config validation, error envelope, requestId và OpenAPI.
- PostgreSQL 16 native trên Windows và Memurai native tương thích Redis API v7; chỉ bind loopback, dùng database/user riêng cho ShopFast và không mở firewall ra mạng ngoài.
- Script `dev:doctor` kiểm tra version/connectivity; contract smoke kiểm tra Redis commands, Lua, Pub/Sub và BullMQ delayed/retry trước khi phụ thuộc vào Memurai.
- Migration runner, seed nhỏ cho dev, test harness PostgreSQL/Redis và cleanup độc lập.
- Outbox table, publisher/worker skeleton và fake adapters cho email/storage/partner để M1 có thể gửi job.
- CI local scripts: format, lint, typecheck, unit, integration và build.

**Gate:** API/worker/web boot; PostgreSQL/Memurai native healthy; migration từ DB rỗng và chạy lại an toàn; outbox fake job chạy end-to-end; Redis/BullMQ contract smoke đạt; không có secret trong repo.

## M1 — Auth vertical slice

**P0**

- Register tạo session giới hạn, OTP qua queue, confirm, login, refresh/logout và RBAC.
- UI register → verify ngay → login/me; staff/admin lấy từ seed.
- Ownership và trạng thái unverified được kiểm tra server-side.

**P1:** refresh rotation/reuse detection, revoke socket/session, OTP rate limit.

**Gate:** luồng register-to-verified khép kín; token/OTP không lộ; tests auth/role/ownership đạt.

## M2 — Catalog và inventory

**P0**

- Category, brand, product, filter/pagination và admin mutation tối thiểu.
- Inventory, movement, available và điều chỉnh có optimistic version.
- UI catalog và staff inventory.

**P1:** concurrent adjustment, audit log và inactive behavior.

**Gate:** catalog đúng khi chưa có cache; không chỉnh reserved trực tiếp; constraint tồn đạt.

## M3 — Cart, checkout và order vertical slice

**P0**

- Cart, một endpoint checkout có promoCode tùy chọn, snapshot giá, reservation, order history và payment mock.
- State transitions, cancel/expire, release/consume tồn và UI customer/kho.
- Outbox cho email tiếp nhận đơn, inventory sync, reminder/expiry; invoice chỉ từ PaymentConfirmed.

**P1:** idempotency, quota promo đồng thời, deadlock retry và rollback tests.

**Gate:** customer đặt đơn → thanh toán mock → kho xử lý → delivered; không oversell; replay không tạo đơn/tác dụng phụ trùng.

## M4 — Jobs và realtime

**P0**

- Worker email/invoice/mock partner, retry/backoff, delayed reminder/expiry và daily report.
- Socket handshake, ownership, room theo order, event version, reconnect/resync.
- Admin queue counters và failed jobs tối thiểu.

**P1:** lease/dedup, dead letter retry, catch-up sau restart, crash-window tests và provider email thật có idempotency/status lookup. Nếu chưa chứng minh được contract provider, evidence “đúng một email” giữ BLOCKED, không giả PASS.

**P2:** đã có cleanup payload job thành công sau 90 ngày, giữ tombstone; archive outbox/dead-letter dài hạn và dashboard vận hành mở rộng còn hoãn.

**Gate:** checkout không chờ provider; event chỉ tới đúng customer; worker restart không làm mất business event.

## M5 — Cache và rate limit

**P0**

- Cache product/list, targeted invalidation sau commit, negative cache và fallback DB.
- Global/user/IP limiter, login target-account protection và limiter riêng khi checkout có promoCode.

**P1:** stampede lock, cache-fill race/version tests, Redis outage và limiter authoritative cho endpoint nhạy cảm.

**P2:** PostgreSQL fallback security counter khi có nhiều API instances; v1 một instance có thể fail closed endpoint nhạy cảm khi Redis down.

**Gate:** đổi một SKU không xóa toàn catalog; không trả giá cũ sau mutation response; 429/Retry-After đúng; đo sơ bộ latency/hit ratio.

## M6 — Ticket và Gemini

**P0**

- Ticket/message/claim và phân loại Gemini nền.
- Hai tool đọc thật: order theo customer của ticket và inventory theo SKU.
- Refusal ngoài phạm vi, grounded answer và proposal đổi category cần click confirm.
- UI support: evidence tool, draft reply và proposal card.

**P1:** timeout/circuit breaker, prompt injection tests, clientMessageId dedup và stale proposal.

**P2:** đã có cleanup hội thoại quá 30 ngày và dataset 30 ticket/confusion matrix (evidence riêng); usage metrics chi tiết còn thiếu.

**Gate:** smoke Gemini thật với key ngoài repo; tool không đọc đơn khách khác; AI không tự ghi hoặc tự gửi khách.

## M7 — Nghiệm thu ứng dụng

- Chạy checklist file 08, coverage business >=60% và sửa lỗi vertical flows.
- Seed dev nhỏ dùng hằng ngày; dataset performance lớn tạo riêng theo script/profile, không chạy trong CI thường.
- Load test trên môi trường ghi nhận rõ; OpenAPI, README, demo seed và kịch bản 10 phút.
- Chạy lại integration/job/cache/realtime suite với Redis 7 thật trên Linux/VPS hoặc runner phù hợp; Memurai local không phải bằng chứng cuối cho Redis 7.
- Hoàn thành P0/P1. P2 chưa xong phải ghi giới hạn và không được mâu thuẫn SRS bắt buộc.

## M8 — Cloud và bàn giao (hoãn thiết kế chi tiết)

Giữ nguyên AWS/Docker images/Docker Compose/Nginx HTTPS/CI/CD/backup/rollback của SRS. Khi quay lại hạ tầng: viết deployment spec, tạo container images và Compose cho VPS/runner, chọn tài nguyên/provider/storage/secrets, kiểm thử migration hai phiên bản, đo trên môi trường đích và diễn tập restore. Không yêu cầu Docker Desktop/WSL trên máy phát triển.

## Phụ thuộc và cách cắt commit

`M0 → M1 → M2 → M3 → M4`; M5 dựa M2/M3; M6 dựa M1/M3/M4; M7 sau M1–M6; M8 cuối.

Mỗi commit hoàn thành một vertical change có contract/migration/test liên quan. Không commit theo lớp kiểu “tạo hết controller” rồi để nghiệp vụ chưa chạy. Một mốc có nhiều commit; chỉ commit khi checks của phần đó đạt.
