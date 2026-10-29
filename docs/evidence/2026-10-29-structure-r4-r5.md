# R4/R5 — Harness và deploy source

29/10/2026. Harness nhóm core/suites/collectors/registries/tests, giữ CLI gốc và npm script công khai. Updated relative/dynamic paths và compiled source paths; scheduler collector kiểm cả service và SQL repository. Không di chuyển `docs/evidence` hoặc hash receipt lịch sử.

Deploy source nhóm containers/nginx/aws/host/release/backup/checks. CI kiểm shell đệ quy và build Dockerfile đường dẫn mới. VPS giữ installed entrypoint `/opt/shopfast/deploy-release.sh`, `migrate.cjs`, Compose và systemd paths để SSM và rollback không đứt.

Kết quả trước release:

- Harness format/source check: PASS, parse 41 scripts không gọi cloud/provider.
- Harness self-test: PASS 19/19.
- Architecture guardrail self-tests: PASS 6/6, source 84 TS files, zero violations.
- Harness inventory: BLOCKED với 62 requirements/49 cases; inventory không kế thừa PASS lịch sử. Đây là kết quả đúng của bước inventory, không phải toàn hệ thống FAIL hoặc PASS.
- VPS: `bash -n` toàn bộ shell source mới PASS; `docker compose ... config --quiet` PASS dùng config đã cài. Không khởi động stack mới hoặc tạo AWS resource.
- Docs links và format: PASS.

CI image build, production smoke và deploy/rollback/restore rehearsal được ghi riêng theo release SHA sau khi hoàn tất; chưa coi static config check là deployment PASS. Raw logs ignored `.secrets/structure-*.log`.
