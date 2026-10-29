# 19 — Cấu trúc repository và ranh giới phụ thuộc

Bố cục dưới đây mô tả source sau các đợt R1–R5 của [plan chuẩn hóa](21-repository-refactor-plan.md). Nghiệm thu release theo R6 và evidence, không suy cấu trúc thư mục thành all-SRS PASS.

## Bố cục

```text
apps/
  api/src/             HTTP, bootstrap, composition của API
  worker/src/          Composition, scheduler và vòng đời worker
  web/src/
    main.tsx           Mount React
    app/               App, routing và navigation
    features/          Auth/account/catalog/cart/orders/tickets/admin
    shared/            API client, presentation và global styles
libs/
  modules/<feature>/src/
    http/              Controller, DTO, guard/interceptor nếu có
    application/       Use case, quyền nghiệp vụ và transaction orchestration
    persistence/       SQL, query builder và mapping dữ liệu
    composition/       Runtime provider, khởi tạo adapter và lifecycle
    adapters/          Gemini, email, PDF hoặc gateway tùy module
    *.contracts.ts     Type/error contract dùng chung trong module
    *.module.ts        Nest wiring
  platform/src/          Config, DB, outbox, health dùng chung
database/              Migration và seed có kiểm soát
tests/                 Unit, integration, contract, runtime, browser
deploy/                containers/nginx/aws/host/release/backup/checks
harness/               run.mjs và CLI ổn định tại gốc
  core/                Context, gate, receipt, artifact verification
  suites/              Cases và các profile kiểm chứng
  collectors/          Browser, host, cloud và evidence collectors
  registries/          Requirement, acceptance và gate mappings
  tests/               Self-test của harness
scripts/               Entrypoint phát triển và smoke provider
tools/                 Công cụ phát triển, không thuộc runtime sản phẩm
docs/                  Spec, quyết định, runbook, bàn giao và evidence
.github/workflows/     Required checks, build và deploy
```

`dist`, `coverage`, `test-results`, `harness/reports`, `tools/.runtime` là kết quả sinh ra và được ignore. `.env` và `.secrets` chỉ chứa cấu hình/credential cục bộ, không phải nơi đặt source sản phẩm. Không di chuyển evidence lịch sử để đổi tên đường dẫn đã được hash; bundle giữ nguyên nội dung lần thực thi gốc.

## Quy tắc kiến trúc

API/worker là composition root. Thư viện không import ứng dụng, test, harness hoặc công cụ. Platform không import nghiệp vụ; nghiệp vụ dùng platform. Browser không import implementation backend hoặc database. Chia module theo chức năng auth/catalog/orders/tickets/ai/jobs/runtime/realtime/operations, không tạo thư mục `utils` chung để gom mọi trách nhiệm.

Scheduler phối hợp jobs/retention/outbox và quản lý tiến trình worker nằm tại `apps/worker/src/foundation-worker.ts`; đặt nó trong platform sẽ tạo phụ thuộc ngược từ platform sang nghiệp vụ. Service nghiệp vụ vẫn dùng transaction và quyền tại server; việc sắp xếp thư mục không đổi API, schema hoặc idempotency key.

`npm run architecture:check` chạy sáu negative/positive fixture rồi dùng TypeScript AST kiểm import/export, literal require/dynamic import và dependency vòng trong apps/libs. Check chặn query tại HTTP/application, persistence import ngược và application tự phụ thuộc Google provider implementation. Rule không thay thế review transaction; import tính toán không được xem là đã phân tích đầy đủ. Runtime cache/limiter là hạ tầng nội bộ, không phải module nghiệp vụ mới.

Repository giữ query và dùng executor do use case truyền xuống, không tự mở transaction lồng nhau. Auth/Catalog/Orders/Tickets/AI/Jobs/Retention đã tách lớp; SQL đặc thù email idempotency nằm trong adapter email. Worker vẫn là composition/scheduling root; SQL vận hành scheduler được kiểm riêng, không được coi là domain controller.

Trên VPS, `/opt/shopfast/deploy-release.sh`, `migrate.cjs`, `compose.*.yml` và systemd entrypoint vẫn là giao diện cài đặt ổn định. Source tương ứng nằm trong các nhóm `deploy/`; cập nhật host bằng cách cài file mới vào entrypoint ổn định, giữ bản cũ cho rollback. Di chuyển source không tự di chuyển dữ liệu PostgreSQL hoặc volume.

Ưu tiên import rõ tới file đang dùng. Chỉ tách thêm controller/DTO/repository khi trách nhiệm cần thay đổi độc lập và có test giữ contract; không tạo interface hoặc lớp rỗng chỉ để tăng số tầng. Không áp dụng microservices, event broker mới hoặc workspace package publishing khi chưa có nhu cầu.

## Thay đổi và kiểm chứng

Di chuyển source bằng mapping và cập nhật import AST, giữ tên lớp/export. Các npm scripts, Nest compiler, Jest và Docker build tiếp tục dùng đường dẫn monorepo gốc. Kiểm typecheck, lint, architecture, unit, integration, browser và build trước khi chốt release. Evidence trước refactor giữ SHA cũ; release mới phải có kiểm chứng phù hợp, không đổi nhãn PASS cũ.
