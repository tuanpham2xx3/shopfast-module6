# R1 — Tách HTTP và module wiring

Ngày 29/10/2026, baseline `5a0fab8`. Đã tách declaration của 8 module vào HTTP/DTO/composition/gateway; module file chỉ giữ Nest wiring. Consumer API/worker/test dùng import trực tiếp, không thêm re-export vòng. AuthRuntime vốn đã riêng file được giữ nguyên.

JobsAdminController không còn ba query SQL: đọc trang failed jobs, CSV report và execution counts qua service. Không thay điều kiện quyền, status code hoặc response shape. Transaction, schema và SDK chưa đổi.

Kiểm chứng trên source R1:

- `npm run check`: PASS, 17 suites / 68 tests; format, lint, typecheck, API/worker/web build đạt.
- `npm run test:integration`: PASS, 16 suites / 69 tests trên PostgreSQL native và Memurai native, gồm HTTP auth/catalog và orders/jobs/tickets/AI/realtime/retention.
- `npm run architecture:check`: PASS, 62 file; bổ sung chặn query/transaction/TypeORM trong thư mục HTTP.
- `npm run test:e2e`: PASS, 19 tests / 1.7 phút, gồm luồng thật purchase/role/realtime reconnect.

Logs local ignored: `.secrets/structure-r1-*.log`. Chưa chạy provider/cloud hoặc deploy; đây không phải all-SRS acceptance.
