# ShopFast Module 6

ShopFast là bài Defense Case Study Module 6: backend thương mại điện tử bằng NestJS/PostgreSQL, bổ sung Gemini AI Agent, realtime order tracking, rate limiting, Redis cache, BullMQ background jobs và UI web tối thiểu để demo.

## Trạng thái

Ứng dụng chạy tại <https://shopfast.tuanpq.com>, gồm auth, catalog/kho/đơn, BullMQ jobs/invoice PDF, Socket.IO, cache/fallback, rate limit, ticket/support và Gemini với human confirmation. Đã có smoke provider thật, CI/CD và các phép đo hiệu năng/restore theo từng SHA. [Chỉ mục evidence](docs/evidence/harness-evidence-index.md) ghi phạm vi đã kiểm chứng; [plan hoàn tất SRS](docs/16-srs-completion-plan.md) giữ các gate chưa đạt. Chưa tuyên bố toàn bộ SRS hoàn tất.

- [Bộ tài liệu triển khai](docs/README.md)
- [Product spec](docs/01-product-spec.md)
- [Implementation roadmap](docs/07-implementation-roadmap.md)
- [Acceptance checklist](docs/08-acceptance.md)
- [Cấu trúc repository và ranh giới phụ thuộc](docs/19-repository-structure.md)
- [Slide HTML/PDF và ghi chú bảo vệ](docs/defense/README.md)
- [Bàn giao và kết quả kiểm chứng mới nhất](docs/20-delivery-status.md)

## Môi trường phát triển

Máy Windows phát triển không dùng Docker Desktop/WSL. Dev dùng PostgreSQL16 native và Memurai tương thích Redis API7; CI/VPS dùng Docker Linux và Redis7 thật. Endpoint test lấy từ env riêng, không hardcode credential hoặc dùng database production làm test database.

Tooling hiện có:

```powershell
cd tools
npm ci
npm run docs:check
npm run format:check
```

Xem [hướng dẫn tooling](docs/11-development-tooling.md) để cài MCP, Node 20 và các công cụ kiểm tra.

## Quy trình

Mọi thay đổi trên branch riêng, kiểm tra và commit theo Conventional Commits. Main yêu cầu application-checks/docs-checks; workflow kiểm format, ranh giới kiến trúc, lint, typecheck, test, coverage, browser và build Linux. Workflow release đẩy image theo SHA lên GHCR rồi dùng AWS OIDC/SSM deploy EC2. Xem [runbook](docs/14-deployment-runbook.md) và [bằng chứng CI chặn test lỗi](docs/evidence/ci-rejection-proof.md).

## Chạy ứng dụng local

Yêu cầu Node 20, PostgreSQL 16 native; worker cần Memurai tương thích Redis API 7. Tạo database/user riêng, chỉ bind loopback; điền URL, secret và `DEV_SEED_PASSWORD` vào `.env` theo `.env.example`. Dùng cùng hostname `127.0.0.1` cho API/web để cookie hoạt động. Không commit `.env`.

```powershell
npm ci
npm run db:migrate
npm run db:seed
npm run dev:doctor
```

Chạy mỗi tiến trình trong một terminal riêng:

```powershell
npm run dev:api
npm run dev:worker
npm run dev:web
```

Với runtime portable của dự án, chạy `powershell -File scripts/local-postgres.ps1 start` và `powershell -File scripts/local-memurai.ps1 start` trước. Helpers dùng port trong `.env`, chỉ bind loopback; Memurai lưu data riêng theo port. Nếu dùng service native đã cài riêng, cấu hình URL tương ứng và không cần helpers portable. `SHOPFAST_RUNTIME_DIR` cho phép worktree trỏ tới runtime native đã có, không commit binary/data/credential.

- API: `http://127.0.0.1:3000/api/v1/health/live`
- Readiness: `http://127.0.0.1:3000/api/v1/health/ready` (503 nếu DB lỗi; Redis lỗi trả degraded).
- OpenAPI khi phát triển: `http://127.0.0.1:3000/api/docs`
- Web: `http://127.0.0.1:5173`; chọn “Khám phá sản phẩm” để mở catalog, giỏ và đơn hàng. Warehouse/Admin có giao diện điều chỉnh tồn và xử lý đơn.
- Seed tạo customer/warehouse/support/admin tại `<role>@shopfast.test`, dùng `DEV_SEED_PASSWORD` khi tạo mới; chạy lại không reset mật khẩu/tồn. Xem [hướng dẫn seed](docs/evidence/m2-catalog.md).
- Email mặc định dùng adapter development-fake được ghi rõ trong admin queue. Cấu hình EMAIL_PROVIDER_URL/TOKEN để dùng HTTPS provider có idempotency; production từ chối email giả.
- Backend giữ GEMINI_API_KEY và GEMINI_MODEL; thiếu cấu hình trả UNAVAILABLE, không giả câu trả lời. Chạy `npm run smoke:gemini` khi sẵn sàng nghiệm thu.
- PDF hóa đơn lưu riêng trong PostgreSQL, tải bằng bearer và link HMAC có hạn; không đưa JWT vào URL. Worker tạo invoice sau payment, reminder/expiry và report theo Bangkok.

`npm run check` chạy format/lint/typecheck/unit/HTTP contract/build. Integration yêu cầu `TEST_DATABASE_URL` và `TEST_REDIS_URL` riêng rồi chạy `npm run test:integration`; test tạo schema/key/queue riêng và dọn sau khi chạy, không dùng FLUSHDB.

Runtime portable, dữ liệu local và credential nằm trong `tools/.runtime`/file ignored; đường dẫn trên máy agent không phải điều kiện cho một máy mới. Cách quản lý PostgreSQL portable: `powershell -File scripts/local-postgres.ps1 start` hoặc `stop`. Memurai phải chạy native và bind loopback; xem [tooling](docs/11-development-tooling.md). Cùng integration suite đã được chạy với Memurai API7 và Redis7Linux; kết quả giữ endpoint/config của từng lần.

[Nguồn public và lịch sử CI](https://github.com/tuanpham2xx3/shopfast-module6), [harness guide](docs/17-harness-guide.md) và [kịch bản nghiệm thu](docs/18-defense-walkthrough.md) là các điểm bắt đầu để kiểm tra bản bàn giao. Tài liệu evidence theo mốc cũ chỉ là lịch sử, không tự đại diện release mới.

Browser E2E thật: đặt `TEST_DATABASE_URL`, chạy `npm run build:api`, cài Chromium bằng `npx playwright install chromium`, rồi `npm run test:e2e`. Test tự chạy API/web trên port 4300/4173, tạo schema riêng và dọn sau khi chạy. Luồng thật gồm đăng ký/xác minh, reload session, nhập tồn, mua/hủy/mua lại, payment MOCK và DELIVERED; không cần Redis cho bộ test này.
