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

`harness:all` vẫn chạy8profiles và report. Các collector case/browser/platform phải chạy thêm trong cùng context; chưa chạy collector thì report đúng là BLOCKED. Chưa có command tự sinh mọi external gate: các gap phải nhìn thấy thay vì runner tự bỏ qua. `requirement-map.json` là danh sách dependency đầy đủ; chính xác của mapping phải review source test, không suy từ test title là đủ rule.

## Receipt và artifact

Receipt lưu `harness/reports/receipts/<runId>-*.json`: caseId, commit, dirty, configHash, executedAt, status, exitCode, command, assertions(expected/actual/passed), artifacts(path/bytes/sha256). Source thay đổi trong lúc collector chạy làm dirty; dirty receipt không thể chứng nhận PASS. Các run cũ được giữ bằng UUID, kể cả FAIL. Một report mới BLOCKED không xóa lịch sử PASS nhưng cũng không được lựa PASS cũ để che lần mới fail.

Log đầy đủ sanitize được lưu theo UUID; output console chỉ là excerpt4KB. SRS/acceptance source hash chuẩn LF, artifact binary hash giữ nguyên byte. Chỉ có hash không chứng minh assertion đúng; manifest giúp người nghiệm thu mở source test/log/screenshot và chạy lại.

`node harness/export-evidence.mjs <receipt.json>` kiểm hash, loại file nhạy cảm/trace, scan secret patterns rồi xuất bundle vào `docs/evidence/runs/<digest>/`. Kết quả EXPORTED_REVIEW_REQUIRED: agent phải review ảnh và nội dung trước stage/commit public. Không tự upload raw reports/trace trong CI.

## Trạng thái thực thi

Xem [development validation](evidence/harness-hardening-2026-10-28.md). Tài liệu này mô tả cách chạy, không phải báo cáo full acceptance. Những case cloud identity, active deploy, external partner, performance release và hồ sơ bảo vệ phải có receipt/biên bản đúng phạm vi trước khi gọi all done.
