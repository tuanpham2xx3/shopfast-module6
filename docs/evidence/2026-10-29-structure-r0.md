# R0 — Baseline trước chuẩn hóa cấu trúc

Ngày: 29/10/2026. Source baseline: `d39faea796dc4aea3c22836d615e2770667690e8`.

Môi trường: Windows, Node 22.17.0 (engine repo cho phép), PostgreSQL 16 native, Memurai Redis API 7 native. Không chạy Docker/WSL. Integration và browser dùng schema test riêng; provider credentials bị vô hiệu hóa trong browser suite.

| Lệnh                                                     | Kết quả thực thi                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `npm run check`                                          | PASS: format, architecture (45 file), lint, typecheck, 17 suites / 68 tests, API/worker/web build |
| `npm run test:integration`                               | FAIL lần đầu: dịch vụ local chưa sẵn sàng; 16 suites / 69 tests lỗi kết nối PostgreSQL/Redis      |
| `npm run test:integration` sau khởi động native services | PASS: 16 suites / 69 tests                                                                        |
| `npm run test:e2e`                                       | PASS: 19 tests, 1.7 phút, gồm purchase/roles/realtime reconnect trên backend thật                 |

Raw logs cục bộ được ignore tại `.secrets/structure-baseline-*.log`, không commit credential hoặc connection string. Receipt này ghi lại cả lỗi môi trường; không tuyên bố provider/cloud đã được kiểm tra.

## Mapping R1

Với auth/catalog/orders/tickets/jobs/operations: controller chuyển từ file module sang `http/<feature>.controllers.ts`; DTO sang `http/<feature>.dto.ts` nếu có. Helper cookie/bearer/origin giữ trong HTTP auth. Tên lớp, decorator, DTO validator và API path giữ nguyên.

Catalog/Order/Tickets/Jobs runtime provider chuyển sang `composition/<feature>.runtime.ts`; RuntimeServices sang `runtime/src/composition/runtime.runtime.ts`, interceptor sang `runtime/src/http/runtime.interceptor.ts`; OrderRealtime sang `realtime/src/adapters/realtime.gateway.ts`. Các module còn giữ wiring và exported provider contracts. AuthRuntime đang ở file riêng, chưa cần đổi đường dẫn trong R1.

Import consumer API/worker/tests phải trỏ trực tiếp declaration mới. R1 không đổi persistence hoặc transaction. Ba query đang nằm trong JobsAdminController sẽ chuyển vào JobsService trước khi đóng gate HTTP không query DB.

## Mapping các đợt sau

R2: service → `application/`, query/mapper → `persistence/`, external adapter → `adapters/`, shared contracts theo module. Lập mapping cụ thể trước từng module vì transaction không thể di chuyển theo tên file đơn thuần.

R3: `main.tsx` → mount + `app/App.tsx`; routing → `app/routing.ts`; catalog/cart/orders/tickets/admin → `features/<feature>/`; client → `shared/api/client.ts`; presentation → `shared/presentation/`; styles → `shared/styles/`. Tách auth/account theo state ownership trước khi di chuyển JSX.

R4/R5: mapping collector/script cần kiểm mọi consumer gồm workflow, Docker COPY, SSH/SSM, runbook; không di chuyển evidence lịch sử. Cây đích và gate đầy đủ ở [plan](../21-repository-refactor-plan.md).
