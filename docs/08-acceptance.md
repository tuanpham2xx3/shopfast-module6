# 08 — Nghiệm thu và bằng chứng

## 1. Quy ước

Mọi case dưới đây ban đầu NOT_RUN. Người thực hiện ghi PASS/FAIL/BLOCKED, commit, môi trường, lệnh, dữ liệu và evidence vào `docs/evidence/`. Không ghi PASS từ việc chỉ đọc code. Test automated ưu tiên cho transaction, ownership, cache race, queue retry và state machine; kiểm tra UI có thể manual với bước tái hiện.

## 2. Đối chiếu yêu cầu

| Nguồn                  | Đặc tả         | Bằng chứng cần có                                          |
| ---------------------- | -------------- | ---------------------------------------------------------- |
| F01 AI                 | 01, 03, 05, 06 | phân loại thật, hai tool thật, refusal, human confirmation |
| F02 realtime           | 03, 04, 06     | đúng room, handshake auth, ownership, reconnect, latency   |
| F03 rate limit         | 01, 04         | user/IP, endpoint nhạy cảm, 429, target-account escalation |
| F04 cache              | 02, 04         | hit latency, invalidation, lock, negative cache, outage    |
| F05 jobs               | 02, 04         | async, retry/backoff, dead letter, dedup, schedules        |
| F06 nghiệp vụ          | 01–03, 06      | filters, cart, transaction tồn, order history, RBAC        |
| F07 vận hành           | 03, 07, 10     | health DB/Redis, queue, Swagger; backup deferred           |
| NFR hiệu năng          | mục 4 dưới đây | báo cáo tải thực tế                                        |
| NFR bảo mật/chất lượng | 01–05, mục 5   | access tests, CI, coverage; cloud deferred                 |
| NFR phục hồi/deploy    | 07, 10         | deployment/rollback/restore evidence giai đoạn hạ tầng     |

## 3. Checklist chức năng

| ID       | Given / When                                                         | Kết quả bắt buộc                                                                                       |
| -------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| AUTH-01  | Đăng ký hợp lệ, đăng ký lại email khác hoa/thường                    | một user; không nâng quyền từ payload                                                                  |
| AUTH-01A | Đăng ký thành công rồi mở màn hình xác minh                          | có access session giới hạn và confirm OTP được ngay, không cần login vòng                              |
| AUTH-02  | Chưa verify gọi checkout; OTP hết hạn/sai 5 lần                      | chặn nghiệp vụ; mã không tái dùng                                                                      |
| AUTH-03  | Refresh token đã rotate được dùng lại                                | family thu hồi, access/session/socket bị từ chối theo policy                                           |
| AUTH-04  | Customer gọi API kho/admin; ID tài nguyên khách khác                 | 403 role, 404 private resource, không lộ dữ liệu                                                       |
| CAT-01   | Kết hợp category/brand/price/sort/page                               | AND filters, totals đúng, input sai 400                                                                |
| CAT-02   | Inactive product/category/brand                                      | không public/checkout; lịch sử đơn còn snapshot                                                        |
| CART-01  | Add cùng SKU, sửa/xóa, quantity 0/100                                | đúng quy tắc, cấm quantity sai, không giữ tồn                                                          |
| ORD-01   | Checkout đủ hàng                                                     | tổng server đúng, reservation/history/outbox/cart nguyên tử                                            |
| ORD-02   | 20 request đồng thời mua hàng chỉ còn 1                              | đúng 1 thành công; onHand/reserved không âm, không oversell                                            |
| ORD-03   | Hai sản phẩm, sản phẩm thứ hai thiếu hàng                            | không giữ tồn sản phẩm đầu, không tạo đơn/job                                                          |
| ORD-04   | Cùng idempotency key gửi đồng thời/lặp sau restart                   | một đơn, kết quả ổn định; khác payload 409                                                             |
| ORD-05   | Giá đổi sau khi mở checkout                                          | PRICE_CHANGED, khách xác nhận lại; không dùng giá client                                               |
| ORD-06   | Payment/cancel/expiry chạy đồng thời                                 | chỉ một transition thắng theo lock/version, tồn/payment hợp lệ                                         |
| ORD-07   | Shipping gọi lại hoặc job release gọi lại                            | consume/release đúng một lần, history không trùng                                                      |
| ORD-08   | Sai transition hoặc stale version                                    | 409, không sửa đơn/tồn/outbox                                                                          |
| ORD-09   | Promo còn 1 quota, nhiều khách checkout                              | không vượt quota; một redemption/customer; hủy không hoàn quota                                        |
| ORD-10   | Giảm onHand xuống thấp hơn reserved                                  | từ chối, có thông báo; không sửa inventory                                                             |
| RT-01    | Missing/expired JWT tại handshake                                    | không kết nối được                                                                                     |
| RT-02    | Hai customer theo dõi hai đơn, kho đổi một đơn                       | chỉ chủ room đúng nhận event, không có PII                                                             |
| RT-03    | Subscribe đơn khách khác/room tự đặt                                 | không join và không nhận event                                                                         |
| RT-04    | Mất mạng, bỏ lỡ event rồi reconnect                                  | resubscribe, REST resync, timeline không trùng/lùi                                                     |
| RATE-01  | Vượt global và sensitive thresholds                                  | 429, Retry-After và tiếng Việt; account/IP key đúng                                                    |
| RATE-02  | Nhiều IP dò cùng tài khoản mục tiêu                                  | khóa leo thang theo account, không chỉ theo IP                                                         |
| RATE-03  | Redis down                                                           | read tiếp tục; sensitive limiter dùng DB, không mở bảo vệ                                              |
| CACHE-01 | Đọc product/list lần hai với dữ liệu ổn định                         | cache hit, dữ liệu đúng, có latency evidence                                                           |
| CACHE-02 | Đổi giá/tồn/category/brand rồi mutation trả thành công               | request mới không nhận version cũ; detail/list liên quan đúng, cache SKU không liên quan còn dùng được |
| CACHE-03 | Cache miss đang nạp trong lúc giá đổi                                | loader cũ không ghi đè value version mới; retry/fallback đúng                                          |
| CACHE-04 | Nhiều request hot key hết TTL; unknown SKU                           | giảm duplicate loads bằng lock; negative cache có TTL                                                  |
| CACHE-05 | Redis timeout/down/recovery                                          | fallback DB, không crash hoặc phục vụ stale price                                                      |
| JOB-01   | Provider email chậm 5 giây khi checkout                              | checkout không đợi provider, outbox tồn tại                                                            |
| JOB-02   | Transient fail rồi thành công/permanent fail                         | retry/backoff đúng; exhausted vào dead letter có lý do                                                 |
| JOB-03   | Crash sau external side effect trước DB DONE                         | email một lần theo provider key, invoice/partner không nhân đôi                                        |
| JOB-04   | Outbox enqueue xong crash trước published                            | không tạo side effect lần hai khi publish lại                                                          |
| JOB-05   | Đơn chưa thanh toán 30 phút, đơn đã pay                              | chỉ đơn đủ điều kiện được nhắc; test clock giả lập                                                     |
| JOB-06   | Qua 60 phút/restart lỡ lịch                                          | expire catch-up, release một lần; report đúng ngày Bangkok                                             |
| JOB-07   | Đơn mới chưa thanh toán, sau đó payment confirmed/cancelled          | chưa có invoice trước payment; đúng một invoice sau PAID; cancelled không có invoice                   |
| TKT-01   | Claim đồng thời và reply sai ownership                               | một support claim thành công, người khác bị chặn                                                       |
| TKT-02   | AI classification fail hoặc nhãn HUMAN có trước                      | ticket còn dùng được, không ghi đè nhãn HUMAN                                                          |
| AI-01    | Hỏi trạng thái đơn/inventory trong context hợp lệ                    | tool chạy service thật, câu trả lời có evidence                                                        |
| AI-02    | Mã đơn không tồn tại/khách khác; tool DB fail                        | không bịa hoặc tiết lộ; trả lỗi an toàn                                                                |
| AI-02A   | Ticket không linked order, tra orderCode thuộc customer ticket       | tra được nhưng không tự link; mã của customer khác bị chặn cùng thông báo                              |
| AI-03    | Hỏi ngoài ShopFast/prompt injection/unknown tool                     | refusal hoặc chặn tool, không đổi quyền                                                                |
| AI-04    | AI đề xuất đổi nhãn, chưa bấm Confirm                                | ticket chưa đổi; text “đồng ý” không thực thi                                                          |
| AI-05    | Confirm lặp, expired, stale hoặc đổi assignment                      | không thực thi hai lần; hết quyền/hạn/version bị chặn                                                  |
| AI-06    | Gemini 429/timeout hoặc loop quá giới hạn                            | kết thúc có kiểm soát, thao tác thủ công vẫn dùng được                                                 |
| OPS-01   | DB down / Redis down                                                 | health phân biệt unavailable/degraded, không báo healthy giả                                           |
| OPS-02   | Chạy Redis/BullMQ contract smoke trên Memurai local và Redis 7 Linux | Lua, Pub/Sub, delayed/retry/dedup cùng đạt; sai khác phải sửa trước nghiệm thu                         |
| UI-01    | Chạy toàn bộ customer/kho/support/admin flow                         | có loading/error/empty, quyền đúng, responsive                                                         |

## 4. Hiệu năng

REQ: cached read p95 <50 ms; lần hai product/list <20 ms; checkout p95 <300 ms; realtime <1 giây; cache hit >=80%; deploy <10 phút. Không tự đổi các ngưỡng này.

DEC performance profile tách khỏi seed dev/CI: tạo theo script 10.000 sản phẩm, 200.000 customer tổng hợp và 100.000 đơn, không chứa PII thật. Không nạp dataset này trong migration, seed dev hoặc CI thường. Warm-up 2 phút, đo 10 phút: 50 VUs catalog có phân bố hot set, 10 VUs checkout dùng stock/account độc lập, 100 sockets theo dõi. Mỗi kịch bản ghi rõ chạy độc lập hay kết hợp; đây không phải cam kết capacity production.

- Ghi CPU/RAM, DB/Redis version, region/network, build mode và commit; workload xác định, lặp lại được.
- HTTP latency đo end-to-end từ load generator gần môi trường chạy; tách số liệu Internet nếu có. Chỉ đo middleware server không đủ chứng minh SLA API.
- Realtime đo từ timestamp commit đến browser nhận bằng clock đồng bộ; báo p50/p95/max, ngưỡng nghiệm thu đề xuất max <1 giây trong healthy run, không che event mất.
- Cache hit tính trên catalog requests đủ điều kiện trong khoảng đo; báo cả cold/warm, error rate và correctness.
- Chỉ tiêu “lần thứ hai <20 ms” đo ít nhất 30 cặp request tuần tự trên cùng key sau warm-up; báo p95 của lần thứ hai và số mẫu, không chọn một lần tốt nhất.
- Error rate kỹ thuật đề xuất <1%; lỗi business cố ý trong contention test báo riêng.
- Không bật AI/provider mạng trong request checkout. Số liệu chưa đạt ghi FAIL và tìm bottleneck; không chỉ đo một request tốt nhất.

## 5. Chất lượng và bảo mật

- Business unit coverage tối thiểu 60%, kèm integration transaction/Redis và API E2E ownership. Fake provider không thay thế smoke test Gemini/email thật.
- CI format/lint/typecheck, unit/integration, build; không merge khi fail. Evidence ít nhất một pipeline bị chặn vì test fail.
- Kiểm tra không có key/token trong repo, bundle UI, Dockerfile hoặc log; không dùng access token trong URL.
- Audit các mutation quan trọng; message/AI output chống XSS; SQL parameterization và DTO whitelist.
- Cloud network/IAM/HTTPS/backup/restore/deploy kiểm tra sau, giữ trạng thái DEFERRED, không đánh PASS.
- Kết quả Memurai local chỉ là bằng chứng phát triển; acceptance Redis cuối phải chạy với Redis 7 thật như SRS.

## 6. Kịch bản demo ứng dụng khoảng 10 phút

1. Khách lọc sản phẩm và checkout, gửi lại request chứng minh một đơn (2 phút).
2. Kho đổi trạng thái, khách nhận realtime đúng đơn (1 phút).
3. Cache hit/invalidate và demo 429 (1 phút).
4. Ticket phân loại Gemini, tra đơn/tồn, ngoài phạm vi và proposal cần confirm (2 phút).
5. Queue retry/dead letter, email/invoice và time-controlled reminder (1 phút).
6. Dành 3 phút cho deploy/rollback và evidence vận hành khi giai đoạn hạ tầng hoàn tất. Nếu chưa có thì ghi demo chưa đủ yêu cầu bảo vệ.

Tăng tốc clock chỉ cho môi trường demo/test, gắn nhãn rõ; production vẫn 30/60 phút như spec.

## 7. Mẫu biên bản

```text
Case ID:
Trạng thái: NOT_RUN | PASS | FAIL | BLOCKED
Commit / môi trường:
Thời điểm Asia/Bangkok:
Dữ liệu / điều kiện trước:
Lệnh hoặc bước thực hiện:
Kết quả mong đợi:
Kết quả thực tế:
Evidence path (log/report/screenshot):
Lỗi còn lại / người kiểm tra:
```
