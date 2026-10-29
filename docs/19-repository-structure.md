# 19 — Cấu trúc repository và ranh giới phụ thuộc

Bố cục dưới đây mô tả hiện trạng. [Plan chuẩn hóa tiếp theo](21-repository-refactor-plan.md) tách HTTP/application/persistence và nhóm frontend, harness, deploy; chưa được coi là cấu trúc đã triển khai.

## Bố cục

```text
apps/
  api/src/             HTTP, bootstrap, composition của API
  worker/src/          Composition, scheduler và vòng đời worker
  web/src/             React UI, chỉ giao tiếp backend qua HTTP/socket
libs/
  modules/<feature>/src/  Module nghiệp vụ, service và adapter theo feature
  platform/src/          Config, DB, outbox, health dùng chung
database/              Migration và seed có kiểm soát
tests/                 Unit, integration, contract, runtime, browser
deploy/                Docker Linux, Nginx, AWS và script vận hành
harness/               Runner, requirement registry, receipt và collector
scripts/               Entrypoint phát triển và smoke provider
tools/                 Công cụ phát triển, không thuộc runtime sản phẩm
docs/                  Spec, quyết định, runbook, bàn giao và evidence
.github/workflows/     Required checks, build và deploy
```

`dist`, `coverage`, `test-results`, `harness/reports`, `tools/.runtime` là kết quả sinh ra và được ignore. `.env` và `.secrets` chỉ chứa cấu hình/credential cục bộ, không phải nơi đặt source sản phẩm. Không di chuyển evidence lịch sử để đổi tên đường dẫn đã được hash; bundle giữ nguyên nội dung lần thực thi gốc.

## Quy tắc kiến trúc

API/worker là composition root. Thư viện không import ứng dụng, test, harness hoặc công cụ. Platform không import nghiệp vụ; nghiệp vụ dùng platform. Browser không import implementation backend hoặc database. Chia module theo chức năng auth/catalog/orders/tickets/ai/jobs/runtime/realtime/operations, không tạo thư mục `utils` chung để gom mọi trách nhiệm.

Scheduler phối hợp jobs/retention/outbox và quản lý tiến trình worker nằm tại `apps/worker/src/foundation-worker.ts`; đặt nó trong platform sẽ tạo phụ thuộc ngược từ platform sang nghiệp vụ. Service nghiệp vụ vẫn dùng transaction và quyền tại server; việc sắp xếp thư mục không đổi API, schema hoặc idempotency key.

`npm run architecture:check` dùng TypeScript AST để kiểm static import/export, literal require và dynamic import trong apps/libs; kiểm các module không còn source TS ở ngoài `src`. Check nằm trong `npm run check`, nên CI sẽ từ chối vi phạm. Đây là kiểm ranh giới source, không chứng minh mọi phụ thuộc runtime hoặc chất lượng thiết kế. Import tính toán không được xem là đã phân tích đầy đủ.

Ưu tiên import rõ tới file đang dùng. Chỉ tách thêm controller/DTO/repository khi trách nhiệm cần thay đổi độc lập và có test giữ contract; không tạo interface hoặc lớp rỗng chỉ để tăng số tầng. Không áp dụng microservices, event broker mới hoặc workspace package publishing khi chưa có nhu cầu.

## Thay đổi và kiểm chứng

Di chuyển source bằng mapping và cập nhật import AST, giữ tên lớp/export. Các npm scripts, Nest compiler, Jest và Docker build tiếp tục dùng đường dẫn monorepo gốc. Kiểm typecheck, lint, architecture, unit, integration, browser và build trước khi chốt release. Evidence trước refactor giữ SHA cũ; release mới phải có kiểm chứng phù hợp, không đổi nhãn PASS cũ.
