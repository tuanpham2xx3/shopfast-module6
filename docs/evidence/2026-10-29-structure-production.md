# Nghiệm thu refactor và release

Ngày 29/10/2026. Production: **`ffcb599805ce937654ef22958f392fd74e11ba55`**, [ShopFast HTTPS](https://shopfast.tuanpq.com).

[PR #22](https://github.com/tuanpham2xx3/shopfast-module6/pull/22) đã merge sau required checks đạt. Tree của PR head `1b927fb` và merge commit giống nhau: `817bc8fa5dd9024bc39a8809a48fbd57b78bf0fb`. Hồ sơ này là bản bổ sung sau deploy; SHA chạy sản phẩm được giữ nguyên, không gán nhãn receipt sang commit tài liệu.

## CI và source

| Kiểm tra                                                                                                   | Kết quả                                                          |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [Application CI trên PR](https://github.com/tuanpham2xx3/shopfast-module6/actions/runs/40876033333)        | PASS, 4m49s                                                      |
| [Application CI trên merge SHA](https://github.com/tuanpham2xx3/shopfast-module6/actions/runs/40876826169) | PASS                                                             |
| [Docs CI](https://github.com/tuanpham2xx3/shopfast-module6/actions/runs/40876826364)                       | PASS                                                             |
| [Build/publish/deploy](https://github.com/tuanpham2xx3/shopfast-module6/actions/runs/40876826276)          | PASS; images và SSM deploy thành công                            |
| Unit/contract                                                                                              | 68/68                                                            |
| Integration                                                                                                | 69/69, PostgreSQL/Redis thật trong CI; PG16/Memurai native local |
| Browser                                                                                                    | 19/19                                                            |
| Harness self-tests / architecture fixtures                                                                 | 22/22 và 6/6                                                     |
| Line coverage                                                                                              | Unit 60.54%; kết hợp 87.05%                                      |

Source đã hoàn tất R0–R6: HTTP/application/persistence/composition/adapters; frontend theo feature; harness và deploy có nhóm trách nhiệm, consumer/CLI được cập nhật. Review độc lập không còn Critical/Important/minor. [Review và các lỗi đã sửa](2026-10-29-structure-r6-review.md).

## Kiểm chứng sau deploy

- Staging: 10 end-to-end checks PASS trên release mới, gồm Resend email OTP, checkout/idempotency, private realtime, invoice PDF, ticket, Gemini hai công cụ và replay, ownership/RBAC, UI mobile.
- Gemini: lần đầu UNAVAILABLE, lần đọc độc lập tiếp theo OK. Giữ cả hai lần trong [JSON evidence](2026-10-29-structure-production.json), không che lỗi phụ thuộc hoặc tuyên bố mọi request đều thành công.
- Customer/warehouse/support/admin: cả bốn đăng nhập và render workspace thành công. UI public và customer/admin trên desktop/mobile PASS, không có overflow hoặc ảnh hỏng trong các kiểm tra đã chạy.
- Runtime 15/15 và scheduler 3/3 PASS. Scheduler kiểm worker đang chạy đúng SHA, command, timer/catch-up và hook reminder/Bangkok; đối chiếu receipt controlled-clock PostgreSQL đúng SHA. Không tuyên bố một ngày báo cáo chưa tới đã thực sự chạy ban đêm.
- Worker crash/restart: 4 checks PASS; side effect đã nhận không bị gửi lại sau reclaim lease. Provider của ca crash là PostgreSQL-backed sink mô phỏng có nhãn rõ.
- Redis process outage/recovery: 4 checks PASS, cache fallback đúng giá DB mới và invalidation trước khi cache dùng lại.
- Active continuity: **57 HTTP reads, 0 lỗi; 3 private socket subscriptions; restored=true**. Diễn tập từ release mới sang release cũ, injected unhealthy candidate rollback, rồi khôi phục release mới. Manifest cuối giữ `ffcb599`; không suy đây là kiểm HA khi host chết.
- Backup S3 mới và restore DB cô lập: PASS trong 7 giây; checksum, số bản ghi, tồn kho hợp lệ, login/read order và PDF checksum đạt. Fixture DB/container được script dọn sau kiểm tra.
- HTTPS readiness cuối: `status=ok`. Manifest cuối image ID `sha256:42d32a5768af99987414b37164fb15d10553f8b2feaec91404ce63aa93f4920d`.

## Phạm vi bằng chứng

[JSON tổng hợp](2026-10-29-structure-production.json) chỉ chứa metadata/assertion đã lọc credential. Raw command logs ở ignored `.secrets/structure-*.log`, receipt/artifact ở ignored `harness/reports/`. Không đưa token, OTP, mật khẩu hoặc file PEM vào Git.

Jest acceptance collector ghi 45 PASS / 4 BLOCKED đúng phạm vi: browser reconnect, performance, Redis platform compatibility và all-role browser cần evidence ngoài Jest. Browser receipt riêng đã PASS RT-04/UI-01; CI Redis 7 và runtime/recovery được kiểm riêng. Không đổi nhãn inventory hoặc bundle lịch sử thành all-SRS PASS. Gate IAM/human QA và capacity/performance của toàn đề không được đóng bằng việc refactor thư mục.

Rulings: dùng feature branch/workspace hiện có; giữ behavior bằng regression hiện có và thêm fixture cho rule mới; installed entrypoint VPS giữ tên nhưng được cài lại nội dung mới, có backup bản trước tại `pre-structure-1b927fb02e215614bcc23c9fc0fd55029474510d`; evidence lịch sử không di chuyển. Không có minor nào bị hoãn trong review refactor.
