# 17 — Chạy và kiểm chứng harness

Nguồn yêu cầu: [SRS completion plan](16-srs-completion-plan.md). Không đồng nhất việc runner tồn tại với full SRS PASS.

## Cấu hình

Không Docker Desktop/WSL. Dev dùng PostgreSQL16 native; Memurai API7 bind loopback, Linux Redis7 trên CI/VPS. `TEST_DATABASE_URL`, `TEST_REDIS_URL`, `TEST_MEMURAI_URL` chỉ đặt env/ignored files. Provider thật chỉ dùng key backend và inbox đã cấp. Không upload `.secrets`, env, DB dump, Playwright trace chứa auth hay log raw chưa review.

## Lệnh và kết quả

| Lệnh                                | Kiểm tra                                                                                           | Khi chưa đủ                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `npm run harness:selftest`          | Runner exit/timeout/redaction, full log/hash, requirement omission/artifact tamper                 | Exit nonzero                                                                                        |
| `npm run harness:inventory`         | Registry62mục SRS +49case docs08, source hash chuẩn LF                                             | Mặc định BLOCKED vì chưa có execution receipt; không phải lỗi inventory                             |
| `npm run harness:cases`             | Jest thực thi và lấy assertion riêng theo `acceptance-map.json`                                    | 45case có selector;4case cần browser/load/platform; thiếu selector/test hoặc suite lỗi không PASS   |
| `npm run harness:browser-cases`     | Purchase, role operations, network offline→missed mutation→reconnect/resync→live update            | Thiếu PostgreSQL, skip hoặc thiếu screenshot đều không PASS                                         |
| `node harness/platform-cases.mjs`   | Cùng Lua/PubSub/BullMQ/cache tests trên Memurai native và Redis7Linux                              | Thiếu một nền không PASS; không gọi Memurai là Redis Linux                                          |
| `npm run harness:cloud-audit`       | AWS read-only SG/EBS/IMDS/S3/OIDC/roles và Identity Center home region                             | Human MFA enforcement/least privilege cần chứng cứ riêng; root MFA không phản ánh Builder ID        |
| `npm run harness:staging`           | HTTPS, provider thật,10luồng và browser4role smoke                                                 | Không thay thế full local browser role actions                                                      |
| `npm run harness:deploy-continuity` | Active browser/order reads/socket qua promotion và rollback injection, finally restore release gốc | Cần staging fixture mới<1h và candidate image có sẵn khác active SHA; bất kỳ read fail nào làm FAIL |
| `node harness/derive.mjs`           | 62requirement từ dependency case + external gates, cùng commit/config                              | Thiếu external receipt thì BLOCKED; không dùng report cũ tự chứng nhận                              |
| `npm run harness:report`            | 8profiles +111requirement/case results + artifact integrity                                        | Exit nonzero nếu thiếu một mục hoặc deployed SHA khác                                               |

`harness:all` chạy8profiles, thêm platform/runtime/cloud audit rồi report. Profile CI dùng case collector `--collect` thay cho Jest integration trực tiếp, và dùng browser collector để tạo receipt; `--collect` chỉ cho phép command exit0 khi các test thực thi PASS, vẫn giữ4case external BLOCKED trong JSON để final report kiểm tiếp. Cloud audit có thể trả BLOCKED cho identity/manual gate và làm all exit nonzero. Chưa có command tự sinh mọi external gate: các gap phải nhìn thấy thay vì runner tự bỏ qua. `requirement-map.json` là danh sách dependency; reviewer vẫn đối chiếu source assertions với từng yêu cầu.
