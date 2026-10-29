# R2 — Auth và Catalog

Ngày 29/10/2026. Baseline R1: `de7ef77`. Đây là hai module đầu của R2, không phải hoàn tất toàn plan.

## Thay đổi

- CatalogService chuyển vào `application/`, query và xây dựng filter/update SQL vào `persistence/catalog.repository.ts`. Cache validation, pagination validation, idempotency, version checks và transaction orchestration giữ trong service.
- AuthService chuyển vào `application/`, 26 query chuyển sang `persistence/auth.repository.ts`; AuthRuntime vào `composition/`, guards vào `http/`. Hash/sign token, OTP policy, refresh reuse và transaction vẫn do service điều phối.
- Error/type contracts tách khỏi service vào `auth.contracts.ts` và `catalog.contracts.ts`. API exception filter giữ nguyên thông báo UTF-8. Cập nhật consumer và test import, không thêm compatibility barrel hoặc migration.
- Repository nhận query executor từ caller. Mọi query trong transaction cũ tiếp tục dùng đúng manager đó; không thêm transaction riêng hoặc thay thứ tự khóa hàng/advisory lock.

Ruling: Auth và Catalog được kiểm chứng và chốt chung một checkpoint R2 sau khi từng module có targeted integration đạt. Chúng cùng thay import tại API composition và realtime tests; checkpoint chung tránh staged import trỏ tới file chưa commit. Các module orders/tickets/AI/jobs/retention vẫn giữ trạng thái chưa refactor persistence.

GitNexus MCP không có trong phiên; dùng TypeScript AST để cập nhật import và `rg` để rà consumer/query. Không xem thiếu graph tool là chứng minh không còn dependency động.

## Kiểm chứng

| Lệnh                                                     | Kết quả                                                                                              |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Catalog targeted integration sau tách repository         | PASS: 4 suites / 10 tests, gồm cache invalidation, concurrent inventory/idempotency và HTTP          |
| Auth targeted integration sau tách SQL                   | PASS: 2 suites / 12 tests                                                                            |
| `npm run check` trên source Auth/Catalog cuối            | PASS: 17 suites / 68 tests; format, architecture, lint, typecheck, API/worker/web build              |
| `npm run test:integration` trên source Auth/Catalog cuối | PASS: 16 suites / 69 tests                                                                           |
| `npm run architecture:check`                             | PASS: 66 TypeScript files, zero violations                                                           |
| Browser lượt đầu                                         | FAIL: 18/19; ca đầu trắng trang, trace ghi CSS module Fontsource từ Vite lỗi `ERR_CONNECTION_FAILED` |

Browser chạy lại trên source/build ổn định: **PASS 19/19, 1.6 phút**, exit 0. Test không tăng timeout hoặc bỏ assertion. Raw logs ignored `.secrets/structure-r2-*.log`; trace lỗi ở `test-results/` (generated). Provider/cloud/production không chạy trong checkpoint này.

Hai negative fixtures đã được chạy với architecture checker: application gọi query trực tiếp và persistence import ngược application đều bị reject với exit 1; bỏ fixture thì 66 file đạt exit 0. Collector Redis outage đã cập nhật đường dẫn compiled CatalogService; remote outage rehearsal chưa chạy lại.
