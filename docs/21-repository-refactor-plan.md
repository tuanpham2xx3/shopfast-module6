# 21 — Kế hoạch chuẩn hóa cấu trúc và phân tầng

Ngày lập: 29/10/2026. Trạng thái: **ĐANG TRIỂN KHAI — R0/R1 hoàn tất, R2 đang thực hiện**.

## Mục tiêu và baseline

Giữ monolith theo module, API/worker/web riêng; tổ chức code theo trách nhiệm để dễ review, tìm và kiểm thử. SRS yêu cầu tách controller, nghiệp vụ và truy cập dữ liệu; không quy định tên thư mục hoặc bắt buộc Clean Architecture đầy đủ. Plan này cụ thể hóa kiến trúc đã chọn trong [data architecture](02-data-architecture.md) và [repository structure](19-repository-structure.md).

Audit hiện tại: `architecture:check` kiểm 45 file TS, không vi phạm các ranh giới hiện có. Đây chưa phải kiểm chứng phân tầng: service còn SQL trực tiếp, controller/DTO/runtime nằm chung trong module file. Frontend còn gom màn hình lớn; harness và deploy còn nhiều file cùng cấp. Không suy kết quả check thành toàn bộ SRS PASS.

Không đổi API, route, schema, seed, UI, stack hoặc dependency major trong refactor. Không khởi động Docker/WSL trên máy Windows, không tạo tài nguyên cloud. Không di chuyển evidence lịch sử, sửa hash receipt hoặc đổi nhãn nghiệm thu cũ.

## Cấu trúc đích

```text
apps/
  api/src/                     bootstrap và composition API
  worker/src/                  bootstrap, scheduler, composition worker
  web/src/
    app/                       App, router, provider và layout
    features/
      auth/                    trang đăng nhập, đăng ký, xác minh
      account/
      catalog/
      cart/
      orders/
      tickets/
      admin/
    shared/
      api/                     HTTP client, xử lý session dùng chung
      ui/                      component thực sự dùng nhiều feature
      presentation/            nhãn trạng thái, định dạng
      styles/                  token, global style
    main.tsx                   mount React
libs/
  modules/<feature>/src/
    http/                      controller, dto, HTTP mapper nếu cần
    application/               use case/service, orchestration
    persistence/               repository, SQL, row mapper
    adapters/                  tích hợp ngoài nếu feature có sử dụng
    <feature>.module.ts        wiring NestJS
  platform/src/               config, DB, outbox, health dùng chung
database/
  migrations/                  giữ nguyên tên và thứ tự migration
  seeds/
tests/
  unit/                      theo module/use case
  integration/               PostgreSQL/Redis/provider adapter
  contract/                  HTTP và quyền
  runtime/                   cache, limiter, dependency behavior
  e2e/                       browser flows
harness/
  core/                      context, receipt, gate, registry
  suites/                    staging, provider, resilience, performance...
  collectors/                browser, host, cloud, artifact collectors
  registries/                requirements và acceptance mapping
  tests/                     self-test harness
  run.mjs                    CLI công khai ổn định
deploy/
  containers/                Dockerfile, Compose
  nginx/
  aws/                       provision và policy liên quan
  host/                      bootstrap, service, timer
  release/                   deploy, migration, seed, rollback
  backup/                    backup và restore
  checks/                    remote performance/resilience rehearsal
scripts/                     entrypoint dev và smoke provider
tools/                       tooling phát triển, không runtime sản phẩm
docs/                        giữ spec, runbook, evidence và link hiện tại
.github/workflows/
```

Chỉ tạo thư mục có code thực tế; không tạo lớp/interface rỗng. Các module hiện hữu giữ nguyên ownership; chưa tách inventory/cart/promotions thành service độc lập hoặc package mới. Test giữ phân loại hiện tại trước, chỉ thêm nhóm theo module khi đủ file để có ích. Asset/license frontend vẫn ở `public/`.

## Ranh giới bắt buộc

- HTTP chỉ validate DTO, lấy principal và gọi application; không query DB hoặc chứa transaction nghiệp vụ.
- Application giữ authorization nghiệp vụ, state machine, idempotency và transaction boundary; gọi persistence qua contract rõ. Không phụ thuộc controller, HTTP response hoặc SDK Gemini.
- Persistence chứa SQL và mapping; nhận transaction context từ use case. Không tự commit transaction con, không phát email/job/socket trước khi transaction hoàn tất.
- Với checkout/cancel/payment, repository phải dùng **cùng EntityManager/connection**; giữ nguyên row lock, thứ tự lock, isolation, unique constraint và atomic outbox. Không thay bằng các lời gọi repository mỗi cái mở transaction riêng.
- SDK Gemini/email/queue nằm ở adapter thích hợp; tool AI vẫn kiểm ownership và yêu cầu human confirmation phía server.
- Platform không import nghiệp vụ; libs không import apps/test/harness/tools; frontend không import implementation backend. Feature không truy cập repository nội bộ feature khác.
- Không tạo barrel export toàn repo hoặc dependency vòng để sửa lỗi import. Alias chỉ bổ sung khi TypeScript, Nest, Jest, Vite và build runtime cùng hỗ trợ.

## Các đợt triển khai

Mỗi đợt là PR riêng trên branch task, local commit sau checks đạt. Nếu quá lớn, chia tiếp theo module; không gộp refactor với thay đổi tính năng.

| Đợt                             | Phạm vi và việc phải làm                                                                                                                                                       | Gate trước khi kết thúc                                                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R0 — Baseline                   | Chụp SHA, status, manifest file/import và public export; lập mapping đường dẫn cũ → mới. Ghi commands, số test, Node/PG/Redis đang dùng; chạy baseline để phân biệt lỗi có sẵn | Baseline build, unit, integration và browser có receipt; lỗi có sẵn phải ghi riêng, không xóa test                                                                   |
| R1 — HTTP và wiring             | Tách controller, DTO, runtime provider khỏi `*.module.ts`, lần lượt auth → catalog → orders → tickets → operations/runtime/realtime/jobs theo code thực có. Module chỉ wiring  | Route/method/status/guard/DTO/OpenAPI không đổi; contract, validation, ownership/role, socket handshake và build đạt                                                 |
| R2 — Persistence                | Pilot catalog trước; sau đó auth → orders → tickets/AI → jobs/retention. Tách query và mapper, giữ orchestration trong application. Cập nhật DI và test seam theo từng module  | Integration DB thật, concurrency, rollback, refresh reuse, oversell, promo quota, cancel/payment race, outbox/dedup, AI confirmation và retention tương ứng đạt      |
| R3 — Frontend                   | Tách App/router/layout/auth khỏi `main.tsx`; di chuyển từng feature. Tách component/hook theo trách nhiệm, giữ state ownership và stable key                                   | Browser regression: deep link/reload, guard/returnTo, popup, dropdown, optimistic/pending cart, realtime reconnect, draft/focus/scroll, mobile và dark mode đạt      |
| R4 — Harness                    | Di chuyển core/suite/collector/registry với mapping; giữ npm CLI và tên gate/requirement ổn định. Sửa import, runner, receipt exporter và workflow artifact paths              | Harness check/selftest, registry coverage, report derive; fixture cũ vẫn đọc được; không đổi evidence lịch sử                                                        |
| R5 — Deploy                     | Nhóm script/config; sửa Compose build context, Docker COPY, Nginx mount, shell relative paths, SSH/SSM command và GitHub workflow. Dùng vị trí script/project root rõ ràng     | Static/syntax checks, image build trên CI Linux và integration Redis 7; trước production phải có rehearsal staging deploy/rollback/backup-restore theo đường dẫn mới |
| R6 — Khóa kiến trúc và bàn giao | Mở rộng architecture checker, đồng bộ README/spec/runbook, rà source cũ/import chết. Tổng hợp diff contract và evidence theo SHA                                               | Full required CI, browser, harness selftest; kiểm image và rehearsal cần thiết; mọi gate có PASS/FAIL/BLOCKED thật và danh sách giới hạn                             |

R1/R2 phải hoàn tất theo module trước khi sang module tiếp theo; R2 không làm một lần toàn bộ repository. R5 làm sau R4 vì script deploy gọi collector/harness. Không chạy provider AI/email thật trong mọi commit di chuyển file; chỉ chạy khi adapter bị tác động hoặc ở nghiệm thu provider cần thiết, tuân thủ quota hiện có.

## Checklist checks và evidence

- Mọi đợt: `git diff --check`, format, architecture, lint, typecheck, build bị tác động; kiểm file ngoài task và secrets trước stage.
- Backend: unit/contract rồi integration với PostgreSQL 16 native và Memurai local; CI Linux Redis 7 vẫn là gate riêng. Test không được thay assertion nghiệp vụ để phù hợp refactor.
- Frontend: build web và E2E hiện có, bổ sung case giữ focus/draft/reconnect nếu chưa có. So sánh screenshot trước/sau cùng viewport và fixture để chứng minh không vô tình đổi UI.
- Harness: `npm run harness:check`, `npm run harness:selftest`; kiểm schema receipt và registry. Deploy: kiểm cả first install, update và rollback, không chỉ build image.
- Tài liệu: `npm run docs:check --prefix tools` và format docs. Mỗi đợt lưu `docs/evidence/<date>-structure-rN.md` với SHA, command, exit code, môi trường, kết quả và đường dẫn artifact; dữ liệu thật phải được lọc credential/PII.

Architecture checker sẽ bổ sung rule cấm SQL/DB trong HTTP, cấm persistence phụ thuộc HTTP/application implementation, cấm SDK provider trong application và phát hiện import vòng. Thêm fixture hợp lệ/vi phạm để chứng minh rule bắt được lỗi. AST rule chỉ là guardrail; review transaction và integration test vẫn bắt buộc. Không bật rule mới trên toàn source đang vi phạm trước khi đợt chuyển đổi tương ứng hoàn tất.

## Điều kiện hoàn thành và rollback

Done khi source thực tế theo mapping đã duyệt, module wiring tách biệt, SQL được cô lập, lệnh dev/test/deploy còn dùng được, docs khớp, không còn import đường dẫn cũ ngoài evidence lịch sử và không giảm coverage/case nghiệp vụ. `main.tsx` chỉ mount; App/layout không chứa form auth hoặc logic xử lý đơn. Không dùng số dòng hoặc số folder làm tiêu chí thay thế chất lượng.

Không tuyên bố all-SRS PASS từ refactor. Các gate provider/IAM/human QA chưa đạt vẫn giữ trạng thái riêng. Task lập plan không bao gồm deploy; từng đợt implementation tuân thủ chỉ dẫn Git hiện hành, PR và required checks.

Nếu đợt lỗi: dừng ở branch/PR đó, sửa hoặc revert commit đợt; không reset lịch sử. Không có migration schema trong plan nên rollback source/image phải tương thích DB hiện tại. Với R5, giữ release trước và runbook đường dẫn cũ đủ để khôi phục; chỉ xóa compatibility entrypoint sau khi mọi consumer đã được kiểm chứng dùng đường dẫn mới.

## Tiến độ

- [x] Audit cấu trúc hiện tại và lập plan.
- [x] R0 baseline và mapping — [evidence](evidence/2026-10-29-structure-r0.md).
- [x] R1 HTTP/wiring — [evidence](evidence/2026-10-29-structure-r1.md), commit `de7ef77`.
- [ ] R2 persistence theo module — [Auth/Catalog đã kiểm chứng](evidence/2026-10-29-structure-r2-auth-catalog.md); orders, tickets/AI, jobs/retention chưa thực hiện.
- [ ] R3 frontend theo feature.
- [ ] R4 harness.
- [ ] R5 deploy.
- [ ] R6 kiểm chứng và bàn giao.
