# CI từ chối test lỗi — 28/10/2026

Fixture độc lập ở commit `016c2ff614deabaf28a1ff95fdadce18c569ad8d`, [PR9](https://github.com/tuanpham2xx3/shopfast-module6/pull/9), đã đóng và không merge. Không có thay đổi fixture trong main hoặc production.

[Application run 40690998876](https://github.com/tuanpham2xx3/shopfast-module6/actions/runs/40690998876) thất bại tại `npm run check`, assertion Jest trong `tests/ci-rejection-fixture.spec.ts:3`: expected `PASS`, actual `intentional failing fixture; never merge`. Kết quả: 1 test failed, 68 passed; 1 suite failed, 17 passed. Docs check vẫn PASS, chứng minh lần từ chối này xuất phát từ test ứng dụng, không phải lỗi format tài liệu.

Trước khi đóng PR, đọc `gh pr view 9 --json mergeStateStatus,mergeable,headRefOid,statusCheckRollup` trả `mergeStateStatus: BLOCKED`, `mergeable: MERGEABLE`, application-checks FAILURE, docs-checks SUCCESS. `MERGEABLE` chỉ nói không xung đột Git; `BLOCKED` phản ánh gate không cho merge.

Đọc `gh api repos/tuanpham2xx3/shopfast-module6/branches/main/protection` xác nhận required checks `application-checks` và `docs-checks`, strict=true, enforce_admins=true. Không gọi merge/bypass để thử vượt protection. Sau khi lưu kết quả, đóng PR với comment tóm tắt evidence; lịch sử CI và source fixture vẫn mở được qua link.

Đối chiếu đường thành công: [PR8](https://github.com/tuanpham2xx3/shopfast-module6/pull/8) có cả hai check PASS trước merge; [release run 40690479298](https://github.com/tuanpham2xx3/shopfast-module6/actions/runs/40690479298) SUCCESS trên merge commit `9b7b96f3503b022e924a26a96f9abcf1d9403ea2`. Release manifest từ EC2 ghi đúng SHA này, thời gian script deploy 18 giây. Thời gian script deploy không đại diện tổng thời gian build, CI và deploy.
