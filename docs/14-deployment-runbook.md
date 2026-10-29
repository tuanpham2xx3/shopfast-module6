# ShopFast — triển khai và khôi phục

Trạng thái từng gate nằm trong [execution ledger](evidence/aws-delivery-progress.md); không suy ra PASS từ việc có script. Chỉ chạy trên EC2 đã xác định, không chạy Docker trên workstation Windows.

## Thành phần và bí mật

- Domain `shopfast.tuanpq.com`, EC2 Sydney; Nginx HTTPS + API/worker private, PostgreSQL16/Redis7 named volumes.
- `/opt/shopfast/.env`: mật khẩu bootstrap DB và image references. `/opt/shopfast/app.env`: application DB role DML, signing keys, Gemini và Resend sending-only key. Files mode600, không commit/cat vào log.
- Admin production phải có email nhận thật được chủ dự án cấp để nhận báo cáo ngày; không để địa chỉ `.test` cho recipient thật. `DEV_SEED_ADMIN_EMAIL` trong credential file ignored ghi email đăng nhập admin production (có thể dùng alias inbox nghiệm thu). Dev local vẫn có thể dùng địa chỉ seed `.test` với fake adapter.
- `.secrets/deployment-seed.env` local giữ credential demo; không reset password người dùng có sẵn. Thay đổi secret/role phải có kế hoạch đồng bộ API/worker và refresh sessions.
- `releases/<commit>/web`, symlink `releases/current`, `nginx/default.conf` và `release.json` lưu release active. Không xóa previous release trước khi nghiệm thu.

## Release

Main phải qua PR và `application-checks`/`docs-checks`, branch protection enforce cả admin. CI kiểm tra code, unit-only60%, integration Redis/Postgres, browser và build Linux images. Workflow Release build/push GHCR bằng GITHUB_TOKEN tạm, deploy job assume role OIDC đúng environment production. Environment chỉ cho protected branch.

`AWS_DEPLOY_ENABLED=true` chỉ bật sau khi OIDC/SSM, image pull và registry visibility đã kiểm tra. Nếu biến chưa bật, deploy job SKIPPED không phải deploy PASS. GHCR images mặc định có thể private; cần chuyển package public trước anonymous pull, hoặc thiết kế auth tạm riêng, không ghi PAT dài hạn lên EC2.

SSM document `ShopFastDeploy` chỉ nhận Commit40hex và chạy script cố định. Role Actions chỉ SendCommand tới document+instance này và đọc trạng thái invocation, không có quyền shell document tùy ý/IAM/S3.

Repo dùng immutable OIDC subject: `repo:tuanpham2xx3@134152079/shopfast-module6@1424291781:environment:production`. Kiểm tra bằng `gh api repos/tuanpham2xx3/shopfast-module6/actions/oidc/customization/sub`; không dùng định dạng chỉ chứa tên repo cũ. Provisioner cập nhật trust cả khi role đã tồn tại. Xem [GitHub OIDC reference](https://docs.github.com/en/actions/reference/security/oidc).

```bash
cd /opt/shopfast
sudo bash deploy-release.sh <commit40hex>
```

Script pull tag SHA rồi resolve digest; dựng API candidate, kiểm tra dependency readiness, chạy migration one-shot, chuẩn bị frontend release, validate Nginx, promote và HTTPS smoke; chuyển worker có drain/lease. Giữ previous configuration để khôi phục khi health fail. Không rollback DB xuống schema cũ; migration phải expand/contract tương thích cả bản trước. Zero downtime/rollback<2min chỉ đạt khi harness đã đo, không từ thiết kế này.

Web release directories0755/files0644 để Nginx worker đọc public assets qua bind mount. Không dùng0750/root-owned cho web root. Deploy và reboot smoke phải kiểm tra cả HTML200/root element và JavaScript asset content-type; API healthy không chứng minh frontend healthy. Staging Playwright phải render form, login thật và mở đơn đã giao; kiểm tra no-overflow của trang lỗi không được tính UI PASS.

E2E local/CI dùng `/api/v1` tương đối qua Vite dev proxy giống production; không chỉ test URL API tuyệt đối. URL WebSocket resolve theo origin trang khi API base tương đối. Staging có browser login/workspace riêng cho Customer/Warehouse/Support/Admin; screenshots và role report nằm trong ignored `harness/reports/`.

Login giới hạn5/IP/phút. Các browser tests dùng chung IP phải đọc429/Retry-After, chờ countdown rồi retry tối đa3lần; không tăng/bypass limiter để test xanh. Gemini public smoke giữ lại trạng thái từng lần trong `aiAttempts`, chỉ thử thêm một read-only turn/session mới sau6giây khi UNAVAILABLE; vẫn yêu cầu OK, đủ hai evidence và replay/no-auto-reply để PASS. Không retry mutation bằng key mới.

## Backup và restore

Daily systemd timer chạy19:00UTC (02:00Asia/Bangkok ngày sau), persistent catch-up, jitter5phút. Backup upload pg*dump custom archive + checksum ra S3 private/encrypted/versioned `backups/`; loại schema fixture `harness*_`/`test\__`, giữ local3ngày, S3 lifecycle30ngày. IAM role lấy credentials tạm từ EC2.

```bash
sudo systemctl status shopfast-backup.timer
sudo systemctl start shopfast-backup.service
sudo journalctl -u shopfast-backup.service --since today
sudo bash /opt/shopfast/restore-rehearsal.sh
```

Restore tải lại từ S3, checksum và restore vào database `harness_restore_<timestamp>`, so sánh counts/invariant tồn và PDF/checksum hóa đơn. Dựng API riêng không public port, trỏ database clone và Redis DB13, dùng credential seed thật để login và đọc snapshot đơn qua HTTP rồi cleanup. Cần chạy staging tạo ít nhất một đơn/hóa đơn trước rehearsal. Không khởi động worker/provider trong clone. Count comparison với DB live có thể fail nếu người dùng ghi đồng thời; phải đối chiếu snapshot/manifest trước khi kết luận corruption. Không restore đè DB live. Nếu backup/restore FAIL, không ghi nghiệm thu đạt và kiểm tra quyền/storage/timer. Theo dõi last-success và credit; lịch daily là RPO tới24h, không phải zero loss.

`harness:backup-restore` thêm HOST-RESTART gate: cần `HARNESS_REBOOT_HOST=true` trong cửa sổ đã cho phép, tạo backup mới trước reboot. Kiểm tra boot ID đổi, named volumes, counts users/products/orders/inventories và release được giữ, HTTPS ready trong180giây. Website gián đoạn ngắn. Count comparison có cùng giới hạn concurrent writes; không kết luận mất dữ liệu chỉ từ count mismatch. SSH tunnel local cần mở lại sau reboot nếu còn chạy integration tests.

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
npm run harness:all
```

Profiles provider chỉ chạy khi `HARNESS_LIVE_PROVIDERS=true`, vào EMAIL_TEST_TO và model backend đã cấp; respect RPM. Redis integration local có thể dùng SSH tunnel tới DB15 với random keys/queues, không flush DB0.

Staging chạy Gemini qua API public trên EC2: tra đơn đã giao và SKU bằng cả hai tool, kiểm tra evidence từ DB, replay cùng clientMessageId và xác nhận không tự thêm tin nhắn cho khách. Provider profile riêng kiểm tra proposal/explicit confirmation bằng PostgreSQL fixture và Gemini thật.

Report trong ignored `harness/reports/`, theo commit/config hash; summary không reuse run khác SHA. Profile thiếu phải BLOCKED và exit nonzero. Secrets scan không thay thế audit lịch sử/image; logs phải redacted trước chia sẻ.

Performance script tạo200kcustomer/10kproduct/100korder trong schema riêng và Redis DB14, không worker gửi provider.50catalogVU,10checkoutVU nhịp6.5s để tôn trọng10checkout/min/account;100socket đo riêng; warmup2min,measure10min quaTLS Nginx nội bộ không public port benchmark. Steady arrival phân bố catalog20ms và checkout650ms giữa các VU, giữ50catalogrequests/sec; kết quả burst đồng bộ ban đầu được giữ riêng, không xóa hoặc đổi ngưỡng để che FAIL. Load generator dùng cùng host nên ghi rõ CPU contention; kết quả không là capacity guarantee hoặc Internet RTT. Script cleanup đúng fixture schema và container, không chạm dữ liệu demo. Không chạy hai suite DB/load song song trên máy nhỏ.

## Sự cố

- App không healthy: giữ API trước, đọc sanitized logs; DB/Redis outage không tuyên bố checkout thành công.
- Email lỗi: kiểm tra Resend events/messageID. Sau23h trạng thái chưa xác định phải manual reconciliation; không blind requeue.
- Worker lỗi: kiểm tra queue/durable execution, lease và failed-job audit, không xóa business tombstone để chạy lại.
- Cert renewal: webroot `/var/www/certbot`, deploy hook validate/reload Nginx. Thử `certbot renew --dry-run` khi cần, không request cert production lặp liên tục.
- IP public đổi sau stop/start: kiểm tra EC2/DNS trước SSH; không tự thay host fingerprint khi không biết lý do.
- Credit hết/không còn xác minh được: không thêm tài nguyên hoặc nâng máy. Paid plan không có hard cap mặc định; user đã upgrade nhưng ngân sách vẫn chỉ credit.
