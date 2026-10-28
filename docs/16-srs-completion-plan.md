# 16 — Kế hoạch đóng toàn bộ yêu cầu SRS

Ngày lập: 28/10/2026, Asia/Bangkok. Trạng thái: PLAN; không phải biên bản nghiệm thu. Nguồn chuẩn là SRS gốc, ưu tiên hơn checklist harness. Plan này thay phần tiến độ/baseline cũ của [plan13](13-end-to-end-delivery-plan.md); giữ docs13 làm thiết kế triển khai và lịch sử.

Cập nhật thực thi: xem [bàn giao source d4fe252](20-delivery-status.md). Registry62REQ+49cases, module layout, CI, browser, runtime, fault injection, S3 restore, tải và bộ slide đã có evidence. Lượt mới chưa all-PASS vì Gemini503, quyền human còn chờ Identity Center và chưa diễn tập/Q&A. Các baseline/nghĩa vụ bên dưới giữ để đối chiếu, không phải khẳng định chưa từng triển khai.

## 1. Đích bàn giao và baseline

Đạt toàn bộ chức năng F01–F07, công nghệ, hiệu năng, bảo mật, phục hồi, chất lượng và đủ bảy sản phẩm bàn giao trong SRS. UI tối thiểu phải demo được mọi vai trò trên desktop/mobile; landing page marketing, thanh toán thật và đa nhà bán hàng không phải điều kiện SRS. Cải thiện thẩm mỹ là công việc riêng, không dùng để thay thế thiếu sót backend.

- Release UI hiện tại: `e6dee5b15691d4dfa63f3956b1f8844b5bc1048c`, HTTPS `shopfast.tuanpq.com`, PR6 và CI/CD đã thành công. Smoke live UI,10 luồng staging và4 vai trò PASS trong `docs/evidence/ui-refresh-live.log`.
- Full harness8profiles PASS trên release backend `edd1fe6f814925636be5c561de8809ea7f0f68be`, có performance/restore/rollback trong `docs/evidence/final-acceptance.log`. Đây là bằng chứng lịch sử theo phạm vi, không tự chuyển thành PASS cho release mới.
- Unit line coverage60,06%; combined line85,23% trong báo cáo cũ. Chỉ line unit vượt60%; statements unit59,06%, không ghi mọi metric đều vượt60%.
- Tồn kho đối tác hiện dùng `versioned-demo`; chưa có bằng chứng kết nối một bên thứ ba thật. Chưa tìm thấy bộ slide bàn giao. Docs README/audit/coverage còn trạng thái cũ.
- File `.log` và raw reports đang ignored: phải xuất bản báo cáo đã loại secrets/PII vào tài liệu tracked hoặc CI artifacts có link/retention rõ ràng; file chỉ ở máy agent không đủ bàn giao.

Mỗi dòng dưới phải được nối tới code/test cụ thể, case ID docs08, lệnh, SHA/config, môi trường, kết quả thực tế và artifact. Chưa xác minh ghi NOT_RUN; không suy ra PASS từ việc có code hoặc có lệnh.

## 2. Ma trận yêu cầu và việc phải đóng

| Nhóm SRS          | Việc cần xác minh/hoàn thiện                                                                                    | Điều kiện đóng                                                                                                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F01 phân loại     | Nhãn nghiệp vụ đúng; lỗi provider không làm mất ticket; nhãn người sửa được bảo toàn                            | Test taxonomy/ownership và smoke Gemini thật, ghi input synthetic/expected/actual                                                                                                    |
| F01 hai tool      | Tra đơn và tồn kho từ DB, đúng context customer/ticket                                                          | Hai tool thật, không tồn tại/khác chủ/DB lỗi không tiết lộ hoặc bịa                                                                                                                  |
| F01 refusal/ghi   | Ngoài phạm vi, injection, tool lạ; proposal chưa confirm, replay/stale/expired                                  | Test âm và một rehearsal live có quota; không có ghi trước xác nhận người có quyền                                                                                                   |
| F02 realtime      | Handshake, room riêng, ownership, reconnect/resubscribe/REST resync                                             | Hai browser khách; ngắt mạng thật rồi nối lại; không rò event, không mất trạng thái cuối                                                                                             |
| F03 rate limit    | Global, login/OTP/promo, account/IP,429 tiếng Việt/Retry-After, dò nhiều IP cùng tài khoản                      | Contract/integration và HTTPS smoke; Redis outage vẫn bảo vệ sensitive endpoints                                                                                                     |
| F04 cache         | Detail/list tổ hợp bộ lọc; invalidation giá/tồn; hot key/negative key; race/outage/recovery                     | Redis7 thật, kiểm tra correctness/version; latency riêng ở gate hiệu năng                                                                                                            |
| F05 queue         | Email/invoice/partner không chặn checkout; retry/backoff/dead-letter/admin visibility                           | Thực thi worker thật, crash trước/sau side effect; dedup và xử lý unknown-send-window, không gửi lại mù                                                                              |
| F05 schedule      | Nhắc30phút, doanh thu hằng đêm, restart catch-up                                                                | Clock test nhanh + chứng minh scheduler production cấu hình đúng, có job/report thật; không đợi30phút cho mỗi unit test                                                              |
| F05 đối tác       | Audit HTTP adapter/service hiện tại; chứng minh payload/version/idempotency/timeout/retry qua ranh giới dịch vụ | Contract demo độc lập được gắn nhãn rõ. Để tuyên bố bên thứ ba thật phải có sandbox/endpoint và credential của đối tác; thiếu thì BLOCKED phần đó, không đổi nhãn thành PASS         |
| F06 nghiệp vụ     | Category/brand/price/pagination, cart, checkout/history/warehouse/RBAC                                          | Toàn bộ AUTH/CAT/CART/ORD docs08: oversell20request/stock1, rollback đa item, quota, price-change, transition/race/idempotency và4vai trò                                            |
| F07 vận hành      | Health DB/Redis đúng trạng thái, queue waiting/active/completed/failed, Swagger tự sinh                         | API và UI thật, lỗi phụ trợ được phân biệt; Swagger khớp contract và truy cập được theo policy staging                                                                               |
| F07 backup        | Lịch daily, dữ liệu ngoài máy app, quyền và retention                                                           | Timer/last-success, S3 object/checksum; restore thật theo gate phục hồi                                                                                                              |
| Công nghệ         | NestJS10/Node20/PostgreSQL16/Redis7, TS, tách controller/service/repository                                     | Version từ lockfile và runtime; Docker/Compose dựng trên Linux; không dùng Docker/WSL local                                                                                          |
| Git/CI/images     | Main qua PR, fail chặn merge, format/unit/integration, tag SHA cố định                                          | Links pipeline PASS và PR test FAIL thực sự bị chặn; image digest↔SHA↔release traceable                                                                                              |
| Bảo mật mạng      | HTTPS redirect;22chỉIP quản trị;80/443public; DB/Redis không public                                             | AWS SG + IPv4/IPv6 + host listeners/Compose + probes độc lập, không chỉ xem compose                                                                                                  |
| Bảo mật danh tính | Role/credentials tạm, least privilege/cấp qua nhóm, MFA; secrets không ở source/image/pipeline                  | Audit IAM/Identity Center groups/permission sets, MFA identity quản trị, OIDC trust và instance role; giải thích riêng key provider Gemini/Resend, không ghi chúng là AWS access key |
| Hiệu năng         | Cached p95<50ms, second-read<20ms, checkout p95<300ms, realtime<1s, hit>=80%                                    | Dataset/load docs08; raw samples/error/lost events/CPU/RAM; network scope rõ; không dùng chỉ số localhost để hứa Internet latency                                                    |
| Deploy            | Từ commit qua pipeline <10phút; người đang thao tác không bị gián đoạn                                          | Đo cả tổng workflow và promotion riêng, browser/API/socket đang hoạt động trong deploy; reconnect có trạng thái đúng, không chỉ ping health                                          |
| Rollback          | Candidate health fail tự rollback<2phút                                                                         | Fault injection sau promotion; old API/web/worker/config tương thích, đo elapsed và thao tác thực tế sau rollback                                                                    |
| Restore/degrade   | Restore<30phút, phụ trợ lỗi giảm chức năng có kiểm soát                                                         | Restore từ S3 vào clone, auth/order/ticket/invoice/invariants; outage/recovery Redis/worker và DB health, không phá DB live                                                          |
| Chất lượng        | Business coverage>=60%, Clean Code, secrets/audit/XSS/SQL/DTO                                                   | Unit và combined tách riêng; tăng unit statements qua60% để tránh cách hiểu metric mơ hồ; test có ý nghĩa, không loại code để đẹp số                                                 |
| UI                | Customer/support/warehouse/admin trên browser desktop/mobile                                                    | Happy/error/loading/empty, phân quyền, reconnect, bàn phím; ảnh thiếu không phá layout; không yêu cầu tự tạo cửa hàng marketing đầy đủ                                               |

## 3. Trình tự thực thi và gate

### P0 — Khóa ma trận và audit phạm vi

1. Lập `docs/evidence/srs-traceability-final.md`: tách từng bullet SRS thành REQ-ID, map implementation, test, artifact và status. Không chỉ map F01–F07 chung chung.
2. Đối chiếu runner: case bắt buộc thiếu phải NOT_RUN/BLOCKED và exit nonzero; runner PASS không được che requirement chưa map. Phân biệt test double, service demo độc lập và provider thật.
3. Read-only audit code/runtime/IAM/network/versions và evidence cũ. Chỉ yêu cầu đầu vào khi gặp thiếu thực tế; không cấp lại những quyền đã có.

Gate P0: mọi bullet và deliverable có dòng; danh sách gap cụ thể, không đánh PASS từ đọc code. Commit docs/test mapping riêng.

### P1 — Đóng gap chức năng và bảo mật

Thực hiện theo thứ tự: transaction/ownership/idempotency → queue/partner/email → realtime recovery/cache/limiter → cloud permissions/network → UI demo còn thiếu. Mỗi bug là task nhỏ trên feature branch, sửa test/docs cùng code, checks đạt rồi local commit. Giữ Gemini3.1FlashLite ở backend, ngân sách tối đa12calls/phút/model tính cả tool round/retry; không đốt quota bằng CI mặc định.

Đối tác: trước hết xác minh demo HTTP độc lập đang làm được gì, viết contract và evidence trung thực. Nếu mục tiêu là tích hợp đối tác thật, cần endpoint sandbox, auth mechanism/secret ignored, SKU mapping, version/idempotency và rate/error contract. SRS không nêu tên đối tác; không tự chọn một dịch vụ trả phí hoặc bắt người dùng mua dịch vụ. Chưa có đầu vào thì giữ riêng phần xác nhận đối tác thật BLOCKED; các phần khác tiếp tục.

Gate P1: test P0/P1 docs08 đủ case; không còn lỗi correctness/security mở, CI đạt. Những khác biệt SRS chưa giải quyết không bị gọi là DEC được tự miễn.

### P2 — Chốt release và nghiệm thu trên đích

1. Build Linux qua CI, required checks/PR rồi deploy trong quyền đã cấp; ghi candidate SHA, digest, config fingerprint đã loại secrets và data fixture.
2. Chạy functional/browser4roles/provider smoke thật; không spam inbox ngoài `EMAIL_TEST_TO` đã cấp. Đặc biệt thử network-loss/reconnect và AI refusal/human confirmation.
3. Rehearsal deploy liên tục có active customer/cart/order/socket; inject unhealthy candidate và kiểm rollback, có cleanup/restore release tốt trong finally.
4. Backup mới và restore clone từ S3; xác minh dữ liệu và PDF; chạy outage có kiểm soát. Host reboot không phải điều kiện zero-downtime, cần tách riêng và chỉ làm trong cửa sổ đã cho phép.
5. Chạy performance khi backend/runtime/load profile có thay đổi hoặc chưa có bằng chứng phù hợp release: warmup2phút + đo10phút, dataset riêng, cleanup. Nếu chỉ đổi docs/UI không chạy lại tải vô ích; ghi rõ source/backend diff và phạm vi evidence kế thừa, không relabel SHA cũ.
6. Khi có lỗi: sửa → CI/deploy → chạy lại nhóm bị ảnh hưởng và dependencies. Chốt bằng một manifest liên kết từng kết quả với release tương ứng; không gom PASS nhiều config không tương thích.

Gate P2: mọi yêu cầu kỹ thuật bắt buộc có evidence đạt hoặc blocker được nêu rõ; còn blocker thì chưa đạt all. Đo elapsed từ timestamp, không suy luận từ cấu hình timeout.

### P3 — Hồ sơ bàn giao và diễn tập bảo vệ

| Sản phẩm bàn giao SRS    | Artifact mục tiêu / tiêu chí                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| URL thật                 | README và report ghi URL HTTPS, health và thời điểm kiểm tra                                                                               |
| GitHub + hướng dẫn local | README cài native PostgreSQL16/Memurai, migrate/seed/run/test; Linux Compose riêng; người mới làm theo được                                |
| Pipeline history         | Link immutable run PASS, PR fixture FAIL chặn merge, deploy/rollback và SHA                                                                |
| Kiến trúc                | Sơ đồ AWS thực tế, data flow HTTP/socket/outbox/queue/provider/backup, bảng component và lý do; trust/network boundaries đúng host hiện có |
| Đặc tả ngắn tích hợp     | Bảng7chủ đề ↔ bài toán ↔ endpoint/job/event ↔ bước demo, không chỉ liệt kê công nghệ                                                       |
| Coverage + restore       | Báo cáo unit/combined riêng, command/SHA/scope và biên bản restore có elapsed/count/checksum đã loại dữ liệu nhạy cảm                      |
| Slide10phút + demo       | Deck xuất được, speaker notes và kịch bản có thời lượng;5phút Q&A, fallback khi Gemini quota/mạng lỗi, link evidence thay vì che lỗi       |

Sửa README docs, audit cũ và coverage baseline bằng banner lịch sử + link kết quả mới; không xóa số liệu thất bại cũ. Báo cáo đã sanitize phải tracked và kiểm link; raw logs không chứa secrets lưu artifact có retention. Tài khoản demo giao qua file ignored, không đưa mật khẩu vào slide/repo public.

Diễn tập đủ10phút: mua hàng/stock → realtime → cache/429 → ticket/AI2tools/confirm/refusal → queue → commit/pipeline/rollback/backup evidence. Người dùng cần tự hiểu và trả lời Q&A; agent cung cấp câu hỏi/đáp án gợi ý và walkthrough, không thể thay việc bảo vệ quyết định của học viên.

Gate P3: đủ7deliverables mở được, dry-run có thời lượng và checklist nghiệm thu cho người dùng; không còn link/log chỉ tồn tại trên máy agent.

## 4. Điều kiện được tuyên bố hoàn tất

### Giao thức chứng minh bắt buộc

Người dùng nhấn mạnh: phải có demo chạy thật, test PASS và minh chứng đầy đủ; không chấp nhận khẳng định do agent tự suy diễn.

- Mỗi REQ-ID có test/demo tái hiện được: điều kiện trước, dữ liệu synthetic, lệnh hoặc bước thao tác, expected/actual, timestamp, SHA/image/config và exit code. Lưu stdout/stderr đã sanitize cùng report tự sinh; không viết tay PASS thay cho output thực thi.
- Luồng UI có screenshots theo bước và Playwright trace hoặc video khi phù hợp. Gắn chúng với API/DB/job/event assertion: một ảnh trang hiển thị không chứng minh transaction, gửi email, ownership hay realtime đã đúng.
- Provider thật có request/message/job correlation ID an toàn, kết quả trả về và assertion ứng dụng; provider accepted không đồng nghĩa inbox delivered. Không công khai OTP, token, password, nội dung khách thật hoặc signed URL.
- Test âm/fault injection phải chứng minh lỗi thực sự đã xảy ra rồi mới chứng minh recovery; có before/after và elapsed. Không coi test chưa inject được lỗi là recovery PASS.
- Evidence manifest liệt kê REQ-ID → run → artifact, SHA256 artifact và lệnh chạy lại. Kiểm tra artifact tồn tại/mở được, không dùng link máy local làm bằng chứng bàn giao duy nhất. Người dùng nhận checklist tự chạy lại các demo chính.
- Harness exit nonzero khi case bắt buộc thiếu evidence/FAIL/BLOCKED/NOT_RUN. Review report đối chiếu SRS độc lập với kết luận tổng của runner; giữ cả lần fail và lần rerun pass, không chọn bỏ kết quả bất lợi.

- Tất cả REQ bắt buộc trong ma trận PASS có evidence; không còn FAIL/BLOCKED/NOT_RUN bị giấu. Chấp thuận demo không được tự diễn giải thành đã có provider thật.
- Tất cả7deliverables hoàn chỉnh; CI required checks xanh, release traceable, không còn thay đổi task bỏ sót.
- Report ghi rõ giới hạn: một EC2 không phải HA, backup daily RPO tới24h, performance phụ thuộc network scope, partner demo nếu còn và quota Gemini.
- Nếu còn hạn chế mâu thuẫn requirement thì báo chưa đạt all, không dùng tỷ lệ phần trăm ước lượng để che gap.

## 5. Đầu vào ngoài và giới hạn quyền

Chốt28/10/2026: người dùng không có sandbox và chọn đối tác demo. Áp dụng D25 trong decision log: nghiệm thu versioned demo hiện có, không còn blocker yêu cầu bên thứ ba thật; giữ nhãn demo và minh chứng queue/retry/idempotency/version. Các đoạn hỏi endpoint phía trên là phương án lịch sử nếu có nhu cầu tích hợp thật.

Hiện chưa cần người dùng cấp lại domain/GitHub/SSH/Gemini/Resend. AWS session hết hạn thì cần login lại; IAM/MFA chỉ yêu cầu thao tác khi audit thiếu quyền hoặc thiếu chứng cứ. Đầu vào đối tác thật là phụ thuộc riêng như P1; không tự tạo bằng chứng.

Giữ EC2/S3/SSM/OIDC hiện có, credit-only; không tự tạo tài nguyên trả phí/nâng máy. Không Docker Desktop/WSL trên Windows. Push/PR/merge khi CI đạt/deploy trong phạm vi đã cho phép; không force-push hoặc bypass checks. Plan này chỉ sửa tài liệu, chưa thực thi fault injection hay triển khai tính năng.
