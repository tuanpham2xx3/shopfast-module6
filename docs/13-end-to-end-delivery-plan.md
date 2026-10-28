# ShopFast — Kế hoạch bàn giao end-to-end

Ngày: 28/10/2026. Trạng thái: PLAN, chưa phải biên bản đạt nghiệm thu. Người dùng yêu cầu agent tự triển khai, test, debug, validate và bàn giao để người dùng nghiệm thu; chủ động gom những cấu hình ngoài quyền truy cập hiện tại.

Đang thực thi: [execution ledger và blocker thực tế](evidence/aws-delivery-progress.md). Profile harness chưa đủ case luôn trả BLOCKED, không được coi lệnh đã tồn tại là tiêu chí đã đạt.

## 1. Kết quả phải bàn giao

Một URL HTTPS chạy ứng dụng đủ vai trò; code qua PR/CI; image theo commit; deploy và rollback tự động; backup ngoài EC2 và restore đã diễn tập; test harness chạy lại được; bảng SRS PASS/FAIL/BLOCKED có evidence; tài khoản demo riêng và kịch bản bảo vệ. Không dùng kết quả cũ để khẳng định build mới đạt. Không chạy Docker/WSL trên máy Windows.

Baseline: EC2 Sydney `i-05647e511e0e1780b`, `m7i-flex.large`, Ubuntu24.04, EBS40GiB; SSH hoạt động. Docker/Compose và PostgreSQL16/Redis7 healthy. GitHub CLI đã đăng nhập chủ repo. Gemini key hiện có ở backend local. Chưa có IAM instance profile, domain/email provider, deployment pipeline hoặc app chạy trên EC2. Không cần người dùng cấp lại SSH/GitHub/Gemini đã có.

## 2. Checklist người dùng cần chuẩn bị trước

### Cập nhật đầu vào đã cấp — 28/10/2026

- Người dùng đã cho phép push branch, tạo PR, merge khi CI đạt và deploy lên EC2 hiện tại; cho phép dùng key Gemini hiện có trên EC2. Không cần xin lại từng bước trong phạm vi này. Quy tắc không force-push/bypass checks vẫn giữ.
- Domain ứng dụng `shopfast.tuanpq.com` đã có A record đúng EC2; Cloudflare CLI local có quyền DNS.
- AWS CLI profile `shopfast` đã đăng nhập tạm qua `aws login`; STS, EC2, IAM list và S3 list đã kiểm tra thành công. SG22 giới hạn IP quản trị /32,80/443 public; EBS40GiB gp3 encrypted. Phiên hết hạn có thể cần người dùng login lại, không tạo key dài hạn.
- Ngân sách: chỉ dùng credit miễn phí hiện có (người dùng báo còn180USD), không chấp nhận phát sinh tiền ngoài credit. Không phải180USD/tháng. Chưa tạo tài nguyên tính phí mới nếu chưa xác minh eligibility/coverage; không tự nâng máy hoặc chuyển paid plan. Credit không được xem là hard spending cap.
- Resend setup key ở `.env` ignored đã có Full access; domain `mail.shopfast.tuanpq.com` và4DNS verified. Inbox `EMAIL_TEST_TO` đã cấu hình. Provider smoke báo delivered và replay cùng key trả cùng messageID; chưa phải nghiệm thu worker adapter.
- Không cần người dùng thêm DNS/email record hoặc cấp lại SSH/GitHub/Gemini/Resend. Agent tạo sending-only domain-scoped key, lưu bảo mật cho app; chỉ thu hồi setup key sau khi xác minh không còn phụ thuộc và có đường quản trị thay thế.
- Các blocker có thể còn: AWS account policy không cho IAM/OIDC/S3, credit không áp dụng/hết hạn, phiên login hết hạn, yêu cầu đổi gói hoặc cần IP/DNS thay đổi. Agent báo chính xác khi gặp, không yêu cầu user setup dự phòng vô ích.

### Email thương hiệu — người dùng đã yêu cầu

Xây HTML responsive đồng bộ ShopFast, tiếng Việt rõ dấu, layout600px dễ đọc trên mobile, CSS inline tương thích Gmail/Outlook, màu chữ đủ tương phản, typography sạch và bản plain text. Không phụ thuộc ảnh bên ngoài để đọc OTP/nội dung; không dùng form/script/tracking pixel. Escape toàn bộ biến không tin cậy; không log OTP, token hoặc rendered sensitive HTML.

| Template          | Nội dung và hành động                                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| OTP xác minh      | Mã6số nổi bật, hạn10phút khớp auth, lưu ý không chia sẻ mã; không nhúng mã vào URL                                                           |
| Xác nhận đơn      | Mã đơn, item snapshot, số lượng, giá/tổng/giảm VND, nút Xem đơn tới trang thật; không đưa địa chỉ/PII dư thừa                                |
| Nhắc thanh toán   | Mã đơn và thời hạn thực tế từ DB, CTA tiếp tục thanh toán; gửi khi còn hợp lệ, không mô tả đã thanh toán                                     |
| Báo cáo doanh thu | Ngày nghiệp vụ Bangkok, số đơn DELIVERED và doanh thu đúng formula, CTA trang admin cần đăng nhập; không gắn bearer/signed secrets vào email |

Sender `ShopFast <no-reply@mail.shopfast.tuanpq.com>`; link về HTTPS `shopfast.tuanpq.com`, chỉ tạo link tới route đã implement và kiểm tra ownership server-side. Payload render lấy snapshot dữ liệu ổn định; retry dùng cùng body/idempotency key, không chèn timestamp render ngẫu nhiên gây409. Không gửi attachment/report dữ liệu nhạy cảm nếu chưa có contract.

Kiểm tra: snapshot/escape/link/format unit tests; preview HTML và mobile screenshot; plain text tương đương; gửi mẫu có nhãn DEMO vào EMAIL_TEST_TO sau khi có adapter, xác minh provider event và người dùng có thể xem Gmail. Ghi evidence hiển thị thực tế, không giả định screenshot browser chứng minh Outlook/Gmail. Không gửi email mẫu hàng loạt hoặc tới customer fixture. Chưa đánh dấu triển khai/PASS.

| Cần cung cấp/thao tác                 | Đầu vào cụ thể                                                                                             | Vì sao / cách giao                                                                                                                                                                                                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain/subdomain và quyền DNS         | Ví dụ `shopfast.example.com`; quyền tạo A/TXT và email quản trị chứng chỉ                                  | Người dùng giữ tài khoản registrar; agent đưa bản ghi chính xác để người dùng nhập nếu không có API DNS. Không gửi mật khẩu registrar. Không bắt buộc Route53.                                                                                            |
| Danh tính AWS tạm thời có quyền setup | Đăng nhập CLI bằng federation/SSO hoặc phiên tạm STS trên máy; agent kiểm tra bằng STS, không in token     | Tạo S3, IAM roles/OIDC, SSM, kiểm tra SG/EBS. Không tạo root access key hoặc IAM access key dài hạn. Nếu trải nghiệm hiện tại không hỗ trợ quyền này, người dùng làm theo policy/Console runbook agent chuẩn bị.                                          |
| Đồng ý phạm vi tài nguyên/chi phí     | Giữ EC2 hiện có; S3 backup, SSM/OIDC roles và DNS/TLS; ngân sách trần do người dùng nêu                    | Không tự mua domain, nâng instance, tạo NAT Gateway/ALB/RDS/ElastiCache hay dịch vụ tính phí khác. Nếu cần IP ổn định, chọn Elastic IP sau khi người dùng xác nhận phí.                                                                                   |
| Email provider gửi thật               | Tài khoản provider, sender domain verified, API key restricted, địa chỉ inbox test nhận OTP/email đơn      | Secret nhập vào file ignored hoặc secret store, không gửi chat. Agent viết adapter đúng API; adapter hiện tại chưa thể gọi thẳng provider bất kỳ. Provider phải có idempotency/status reconciliation; không dùng SMTP đơn thuần để tuyên bố exactly-once. |
| Phạm vi GitHub tự động                | Cho phép push feature branch, tạo PR, thiết lập required CI, merge PR khi checks đạt và deploy lên EC2 này | Chỉ repo `tuanpham2xx3/shopfast-module6`; không force-push, không bỏ protection, không đưa private key SSH vào Actions. Chưa coi yêu cầu plan là đã cho phép merge tự động.                                                                               |
| Demo seed                             | Agent tự sinh credential ngẫu nhiên cho customer/support/warehouse/admin; người dùng chỉ cần inbox test    | Credential lưu local/server protected, không ghi docs công khai. Dữ liệu demo giả, không dùng PII thật.                                                                                                                                                   |

Gemini: giữ `gemini-3.1-flash-lite`, mỗi model quota độc lập 15 RPM theo thông tin người dùng. Harness giới hạn <=12 request/phút/model, tính cả tool round/retry; không tự đổi model hoặc mua quota. Secret hiện có không cần cấp lại, chỉ cần xác nhận cho dùng trên EC2.

### Email provider cần lưu ý

Có thể dùng Resend nếu người dùng chưa có provider; phải verify DNS sender. Resend giữ idempotency key 24 giờ, vì vậy không đủ để khẳng định retry vô hạn vẫn một email. Implementation phải lưu provider message ID, giới hạn thời gian automatic retry theo contract, đưa trạng thái gửi không xác định quá cửa sổ vào manual review thay vì gửi lại mù. Kiểm thử cả accepted-send/crash-before-DB, timeout và replay sau cửa sổ. Chỉ gửi tới inbox test đã cấp, không gửi hàng loạt.

## 3. Kiến trúc triển khai dự kiến

- Một EC2 hiện có; Nginx terminate TLS, phục vụ frontend và proxy `/api` + Socket.IO; chỉ HTTP/HTTPS public, SSH quản trị `/32`.
- PostgreSQL/Redis dữ liệu chung, mạng Compose private, volume bền. Application user không superuser; migration user riêng. Redis AOF + noeviction, giới hạn RAM và theo dõi backlog.
- Hai slot API blue/green, hai bản frontend theo release; Nginx chuyển sau health+smoke. Worker chuyển có drain/lease để không mất job; không mặc định hai worker chạy song song an toàn nếu chưa test. Một host không bảo đảm chịu lỗi toàn máy.
- Image build trên GitHub-hosted runner, publish GHCR bằng GITHUB_TOKEN, tag commit SHA + pin digest triển khai; không dùng latest. Kiểm tra image có secrets/font invoice/nonroot/healthcheck/graceful shutdown.
- GitHub Actions assume role qua OIDC, invoke SSM document giới hạn đúng instance để deploy. Instance role dùng SSM và quyền S3 prefix backup. Không mở SSH toàn Internet cho runner, không dùng AWS key dài hạn/self-hosted runner public repo trên máy production.
- Backup `pg_dump` hằng ngày ra S3 private, Block Public Access, encryption, versioning, lifecycle retention đề xuất30 ngày; checksum/manifest/commit/schema. Giữ app secret ngoài backup công khai. Retention30 ngày là DEC cần điều chỉnh nếu ngân sách khác.
- Restore vào DB/container tách biệt, xác minh counts/invariants và smoke rồi xóa fixture sau evidence; không restore đè DB demo đang dùng. Không dùng database rollback sau deploy lỗi; migration expand/contract tương thích bản cũ.

## 4. Mốc triển khai, thứ tự và gate

| Mốc                         | Công việc cụ thể                                                                                                                                                                                                                                                                                  | Gate / evidence                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| E0 — Baseline/preflight     | Branch task riêng; inventory diff/remote/migrations; kiểm tra SSH/host/volumes/backup trước mutation; kiểm tra quyền AWS, SG22 `/32`,80/443, EBS encryption, MFA/group; chạy lại baseline                                                                                                         | `preflight.json` không secrets, danh sách blocker chính xác; không tự destroy tài nguyên                                                       |
| E1 — Production correctness | Cấu hình validated; fail-fast secrets/provider; proxy trust chỉ đúng Nginx; secure refresh/origin; health live vs ready; Swagger staging có kiểm soát; adapter email đúng provider; partner HTTP adapter + service mô phỏng tách biệt, explicit demo contract production, không tắt guard để chạy | Test quyền, timeout, cookie/IP spoof, email dedup, partner version/idempotency; unit business >=60% độc lập integration                        |
| E2 — Packaging              | Dockerfile multi-stage API/worker/web; lock dependencies, font PDF; compose ứng dụng/resources/health; role DB least privilege; migration one-shot; seed demo idempotent; log redaction/rotation                                                                                                  | Build Linux thật trên CI/EC2, image scan và smoke API/worker; PostgreSQL/Redis không public; image version rõ                                  |
| E3 — HTTPS first deploy     | Domain DNS; Nginx websocket/timeouts/body limits; HTTP redirect; ACME renewal; production env protected; migrations và demo seed; deploy trên host                                                                                                                                                | HTTPS chain/redirect, cookie flags, startup health; role flows với DB/Redis thật; không dùng NODE_ENV=development để né provider               |
| E4 — Full harness           | Unit + integration Redis7/PostgreSQL16; browser full roles trên target; provider real opt-in có quota; crash/restart/failure injection vào fixture; gom evidence machine-readable                                                                                                                 | Tất cả case P0/P1 docs08 có kết quả; không skip ngầm; HTTP ownership/socket/tool/invoice đúng                                                  |
| E5 — CI/CD                  | PR branch protection, lint/type/unit/integration/E2E/build; GHCR SHA; OIDC/SSM; deploy concurrency lock; immutable release manifest; health promotion; rollback old API/frontend/worker tương thích                                                                                               | Pipeline PASS + một PR fixture test FAIL chặn merge; deploy <10min; injected unhealthy release rollback <2min; trace commit→image→host         |
| E6 — Backup/restore         | IAM/S3 lifecycle; systemd timer; backup logs không secrets; alert lỗi/stale backup; isolated restore harness                                                                                                                                                                                      | Backup upload/checksum; restore thật <30min; restored auth/order/ticket/invoice invariants; RPO công bố theo daily backup, không hứa zero loss |
| E7 — Performance/resilience | Dataset và workload docs08; kiểm tra footprint trước nạp; warmup/load riêng môi trường fixture; metrics CPU/RAM/DB/cache/queue/socket; debug bottleneck rồi rerun                                                                                                                                 | Cached p95<50ms; second-read p95<20ms/30cặp; checkout p95<300ms; realtime<1s; hit>=80%; báo cả error/lost events và không hạ ngưỡng            |
| E8 — Final acceptance       | Review SRS/code/config; rerun acceptance sau fix cuối; dry-run defense; README/architecture AWS thực tế/runbook/demo/slide10min; checklist người dùng                                                                                                                                             | Bảng PASS/FAIL/BLOCKED + links run/commit/screenshots; không gọi ALL DONE khi gate bắt buộc chưa đạt                                           |

Mỗi mốc có commit riêng sau check, evidence chỉ ghi số liệu đã chạy. E1/E2 có thể làm khi chờ DNS/AWS/provider. E3/E5/E6 phụ thuộc checklist ngoài; không giả lập PASS để vượt gate. Nếu workload lớn không đạt trên máy hiện có, báo bottleneck và phương án chi phí trước khi nâng máy.

## 5. Thiết kế full harness

Thư mục dự kiến `harness/`: `preflight`, `unit`, `integration`, `browser`, `providers`, `resilience`, `performance`, `backup`, `deployment`, `report`. Một runner orchestrate theo profile, có timeout, cleanup trong finally, resume theo checkpoint cùng SHA/config hash và exit nonzero nếu required case FAIL/BLOCKED. Không tái dùng PASS khác commit một cách im lặng.

Profiles: `local` không Docker workstation; `ci` PostgreSQL16/Redis7 service; `staging` HTTPS+provider thật opt-in; `load` dataset riêng; `recovery` restore/rollback riêng. Live Gemini/email absent from default untrusted PR CI. Fork PR không nhận secrets hay quyền deploy.

Mỗi run: `runId`, commit, image digest, time UTC và Asia/Bangkok, host/version, caseId docs08, expected/actual, duration, status, sanitized artifact links. Reports JSON + Markdown/JUnit; raw logs/screenshots artifact với retention, PII redacted; không đưa token, `.env`, password, OTP, DB dump, signed URL hoặc full user prompt vào Git.

Các nhóm case bắt buộc:

1. Auth OTP delivery thật/expiry/reuse/logout/refresh rotation, RBAC và account escalation, cookie/origin/proxy.
2. Catalog filter/inactive/cache hit/invalidation race/hot key/negative key; Redis mất và phục hồi, DB authoritative.
3. Checkout oversell20request/stock1, lock-order/deadlock, promoquota1, rollback multi-item, price changed, repeat keys, pay/cancel/expire races, lifecycle/invoice ownership.
4. Socket handshake/ownership/room isolation/reconnect/network loss/logout/token expiry, timestamp commit→receipt và lost-event accounting.
5. Queue durable outbox, worker crash, accepted provider crash, backoff/dead-letter/admin retry, reminder/report injected clock; kiểm tra số lần side effect.
6. Ticket competing claims, linked-order scope, Gemini both tools/refusal/injection/429/schema/tool limit, proposal stale/expired/assignment/replay và explicit human reply approval.
7. Stop/restart API/worker/Redis trong fixture, host restart rehearsal sau backup; assert durable volumes và backlog recovery. Không inject DB destruction hoặc provider abuse trên dữ liệu người dùng.
8. HTTP public target: HTTPS/headers, no DB/cache/API directport, Swagger policy, secrets scan image/frontend/history/config, leastprivilege IAM evidence.

Load dataset: 10k sản phẩm, 200k synthetic customer,100k đơn; seed theo batch có run prefix/resume và cleanup scope an toàn. Không tạo 200k password hashes tốn CPU vô ích, không gửi email/classify fixture hàng loạt. Warmup2min/measure10min:50catalog VU,10checkout VU,100socket. Dùng rate schedule phù hợp limiter, phân bổ account/IP đúng; report 429 thay vì bypass rate limit. Không thu hồi limiter để đẹp latency. Load generator cùng region nhưng đo qua HTTP/TLS Nginx; nếu cần máy thứ hai phải xin xác nhận tài nguyên. Đồng hồ đồng bộ; tách Internet RTT khỏi đo server-region.

## 6. Lệnh mục tiêu cần implement và chứng minh

```text
npm run harness:preflight
npm run test:unit:coverage
npm run harness:ci
npm run harness:staging
npm run harness:providers
npm run harness:resilience
npm run harness:performance
npm run harness:backup-restore
npm run harness:deploy-rollback
npm run harness:report
```

Các lệnh trên là target plan, CHƯA tồn tại/CHƯA chạy. Runner không reset/drop app schema mặc định; require explicit fixture marker và validate host/database name trước destructive cleanup. Tách service account test/demo và phase load; không ảnh hưởng inbox thật ngoài địa chỉ được cấp.

## 7. Điểm quyết định và giới hạn

- Người dùng đã cấp quyền push/PR/merge khi CI đạt/deploy và dùng Gemini trên EC2 theo cập nhật mục2; tài nguyên tính phí vẫn chịu giới hạn credit-only. SSH baseline/DNS/Resend smoke đã thực hiện. Những dòng checklist ban đầu mô tả yêu cầu đầu vào, trạng thái mới nhất ở cập nhật mục2 được ưu tiên.
- Agent tự sửa bug, bổ sung test, commit, chạy harness trong phạm vi. Không dừng hỏi lại từng lệnh reversible; chỉ hỏi khi thiếu quyền/secret hoặc phát sinh chi phí/phá hủy nằm ngoài phạm vi.
- Daily backup không đồng nghĩa zero data loss; deploy blue/green một host không đồng nghĩa HA toàn hệ thống. Worker quiescence/backlog phải đo riêng.
- Không coi partner mock/email fake là provider thật; demo partner service được gắn nhãn rõ và tested contract, yêu cầu đối tác thật cần endpoint riêng nếu người dùng có.
- Không cam kết lịch hoàn thành trước khi preflight hết blocker; sau đó hoàn tất theo gate, debug/rerun đến khi đạt hoặc báo blocker bên ngoài rõ ràng.

## 8. Tài liệu tham chiếu

- [SRS acceptance](08-acceptance.md), [SRS audit](evidence/srs-audit-2026-10-19.md), [EC2 baseline](evidence/ec2-bootstrap-2026-10-28.md).
- [GitHub OIDC → AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws).
- [SSM instance permissions](https://docs.aws.amazon.com/systems-manager/latest/userguide/setup-instance-permissions.html).
- [Resend idempotency window](https://resend.com/changelog/idempotency-keys).
