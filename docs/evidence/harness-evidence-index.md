# Evidence index — harness source ebcfe5b

Các bundle dưới đây được xuất từ execution receipts trên clean source commit `ebcfe5bc1462bd10d728b7a80d3355f2729e500f`. Commit thêm evidence chỉ thay tài liệu, không được gán lại SHA thực thi. Artifacts gồm log sanitize đầy đủ, assertion summaries, source test hashes và ảnh synthetic đã review; không gồm raw Playwright trace, env hoặc credentials.

- [Jest case receipts + artifacts](runs/3fdfa94785dd2c69/manifest.json):45case selector PASS,4case external BLOCKED. Đây không phải49case đều PASS.
- [Browser receipts + artifacts](runs/4fc4eb85bf7b5b17/manifest.json):RT-04 vàUI-01PASS, purchase/role operations/offline recovery. Các assert và source test được kèm để reviewer kiểm scope.
- [Development và live rehearsal](harness-hardening-2026-10-28.md): ghi cả continuity FAIL trước sửa Nginx và PASS sau sửa; cloud identity vẫn chưa chốt least privilege/MFA enforcement.

Platform OPS-02 riêng đã chạy cả Memurai4.0.1/API7.0.11 và Redis7.4.8Linux,5test mỗi nền PASS; config fingerprint khác Jest/browser do endpoint Redis khác, không tự gộp thành final release PASS. Performance CACHE-01 cần run đúng release/config, không dùng dữ liệu load cũ để gán PASS cho source mới.

Báo cáo yêu cầu tổng hiện BLOCKED. Các bundle này chỉ chứng minh phạm vi được nêu, không chứng minh toàn bộ SRS, partner thật hoặc hồ sơ bảo vệ hoàn tất.

## Evidence bổ sung theo release

- [Hiệu năng và restore trên f8d1696](verified-performance-restore.md): bundle nguyên byte, timestamp và giới hạn phép đo.
- [CI từ chối test lỗi](ci-rejection-proof.md): PR9 đã đóng, application-checks FAILURE và merge BLOCKED; fixture không vào main.
- [Continuity trên source sạch d208339](harness-continuity-follow-up.md): target9b7b96f,57HTTPreads/3socket subscriptions/0errors, rollback5giây và restore release ban đầu. Không gộp thành report111mục PASS vì khác SHA/config với lần full run.
