# ShopFast — triển khai và khôi phục

Trạng thái từng gate nằm trong [execution ledger](evidence/aws-delivery-progress.md); không suy ra PASS từ việc có script. Chỉ chạy trên EC2 đã xác định, không chạy Docker trên workstation Windows.

## Thành phần và bí mật

- Domain `shopfast.tuanpq.com`, EC2 Sydney; Nginx HTTPS + API/worker private, PostgreSQL16/Redis7 named volumes.
- `/opt/shopfast/.env`: mật khẩu bootstrap DB và image references. `/opt/shopfast/app.env`: application DB role DML, signing keys, Gemini và Resend sending-only key. Files mode600, không commit/cat vào log.
- `.secrets/deployment-seed.env` local giữ credential demo; không reset password người dùng có sẵn. Thay đổi secret/role phải có kế hoạch đồng bộ API/worker và refresh sessions.
- `releases/<commit>/web`, symlink `releases/current`, `nginx/default.conf` và `release.json` lưu release active. Không xóa previous release trước khi nghiệm thu.

## Release

Main phải qua PR và `application-checks`/`docs-checks`, branch protection enforce cả admin. CI kiểm tra code, unit-only60%, integration Redis/Postgres, browser và build Linux images. Workflow Release build/push GHCR bằng GITHUB_TOKEN tạm, deploy job assume role OIDC đúng environment production. Environment chỉ cho protected branch.

`AWS_DEPLOY_ENABLED=true` chỉ bật sau khi OIDC/SSM, image pull và registry visibility đã kiểm tra. Nếu biến chưa bật, deploy job SKIPPED không phải deploy PASS. GHCR images mặc định có thể private; cần chuyển package public trước anonymous pull, hoặc thiết kế auth tạm riêng, không ghi PAT dài hạn lên EC2.

SSM document `ShopFastDeploy` chỉ nhận Commit40hex và chạy script cố định. Role Actions chỉ SendCommand tới document+instance này và đọc trạng thái invocation, không có quyền shell document tùy ý/IAM/S3.

```bash
cd /opt/shopfast
sudo bash deploy-release.sh <commit40hex>
```

Script pull tag SHA rồi resolve digest; dựng API candidate, kiểm tra dependency readiness, chạy migration one-shot, chuẩn bị frontend release, validate Nginx, promote và HTTPS smoke; chuyển worker có drain/lease. Giữ previous configuration để khôi phục khi health fail. Không rollback DB xuống schema cũ; migration phải expand/contract tương thích cả bản trước. Zero downtime/rollback<2min chỉ đạt khi harness đã đo, không từ thiết kế này.

## Backup và restore

Daily systemd timer chạy19:00UTC (02:00Asia/Bangkok ngày sau), persistent catch-up, jitter5phút. Backup upload pg_dump custom archive + checksum ra S3 private/encrypted/versioned `backups/`; loại schema fixture `harness_*`/`test_*`, giữ local3ngày, S3 lifecycle30ngày. IAM role lấy credentials tạm từ EC2.

```bash
sudo systemctl status shopfast-backup.timer
sudo systemctl start shopfast-backup.service
sudo journalctl -u shopfast-backup.service --since today
sudo bash /opt/shopfast/restore-rehearsal.sh
```

Restore tải lại từ S3, checksum và restore vào database `harness_restore_<timestamp>`, so sánh counts/invariant tồn, đo thời gian rồi cleanup. Count comparison với DB live có thể fail nếu người dùng ghi đồng thời; phải đối chiếu snapshot/manifest trước khi kết luận corruption. Không restore đè DB live. Nếu backup/restore FAIL, không ghi nghiệm thu đạt và kiểm tra quyền/storage/timer. Theo dõi last-success và credit; lịch daily là RPO tới24h, không phải zero loss.

## Harness

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

Profiles provider chỉ chạy khi `HARNESS_LIVE_PROVIDERS=true`, vào EMAIL_TEST_TO và model backend đã cấp; respect RPM. Redis integration local có thể dùng SSH tunnel tới DB15 với random keys/queues, không flush DB0.

Report trong ignored `harness/reports/`, theo commit/config hash; summary không reuse run khác SHA. Profile thiếu phải BLOCKED và exit nonzero. Secrets scan không thay thế audit lịch sử/image; logs phải redacted trước chia sẻ.

Performance script tạo200kcustomer/10kproduct/100korder trong schema riêng và Redis DB14, không worker gửi provider.50catalogVU,10checkoutVU nhịp6.5s để tôn trọng10checkout/min/account;100socket đo riêng; warmup2min,measure10min quaTLS Nginx nội bộ không public port benchmark. Load generator dùng cùng host nên ghi rõ CPU contention; kết quả không là capacity guarantee hoặc Internet RTT. Script cleanup đúng fixture schema và container, không chạm dữ liệu demo. Không chạy hai suite DB/load song song trên máy nhỏ.

## Sự cố

- App không healthy: giữ API trước, đọc sanitized logs; DB/Redis outage không tuyên bố checkout thành công.
- Email lỗi: kiểm tra Resend events/messageID. Sau23h trạng thái chưa xác định phải manual reconciliation; không blind requeue.
- Worker lỗi: kiểm tra queue/durable execution, lease và failed-job audit, không xóa business tombstone để chạy lại.
- Cert renewal: webroot `/var/www/certbot`, deploy hook validate/reload Nginx. Thử `certbot renew --dry-run` khi cần, không request cert production lặp liên tục.
- IP public đổi sau stop/start: kiểm tra EC2/DNS trước SSH; không tự thay host fingerprint khi không biết lý do.
- Credit hết/không còn xác minh được: không thêm tài nguyên hoặc nâng máy. Paid plan không có hard cap mặc định; user đã upgrade nhưng ngân sách vẫn chỉ credit.
