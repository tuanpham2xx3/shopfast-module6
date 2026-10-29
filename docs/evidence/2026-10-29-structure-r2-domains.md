# R2 — Orders, Tickets/AI, Jobs và Retention

29/10/2026, baseline `1dbc60e`. Đã chuyển 51 query Orders, 14 query Tickets, 18 query AI và 29 query Jobs sang persistence. Retention SQL chạy qua repository trên cùng transaction manager; timeout, advisory lock và SKIP LOCKED giữ nguyên. Application giữ ownership/state machine/idempotency/confirmation và transaction orchestration. Shared error/type contracts không phụ thuộc application.

Email/PDF/Gemini nằm trong adapters. Google provider dựng trong composition API/worker; AI application nhận provider, default chưa cấu hình trả unavailable. Email idempotency SQL vẫn là chi tiết của email adapter. Không đổi API/schema/migration, lock ordering, queue business key hoặc partner demo.

Kiểm chứng thực thi trên Windows native PG16/Memurai API7:

- Targeted Orders/Tickets-AI/Jobs: 3 suites / 31 tests PASS.
- Full integration sau move/wiring: 16 suites / 69 tests PASS, gồm retention, resend, realtime, outbox và cache.
- Full `npm run check`: 17 suites / 68 tests PASS; build API/worker/web, format, lint, typecheck đạt.
- Browser trên source chung R2–R5: 19/19 PASS, 1.6 phút. Không gọi Gemini/email thật trong deterministic suite.

Logs ignored: `.secrets/structure-r2-domain*.log`, `.secrets/structure-final-check.log`, `.secrets/structure-final-e2e.log`. Cloud/provider acceptance giữ gate riêng; không suy refactor thành all-SRS PASS.
