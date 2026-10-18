# ShopFast Module 6

ShopFast là bài Defense Case Study Module 6: backend thương mại điện tử bằng NestJS/PostgreSQL, bổ sung Gemini AI Agent, realtime order tracking, rate limiting, Redis cache, BullMQ background jobs và UI web tối thiểu để demo.

## Trạng thái

Đã có auth, catalog/kho/đơn, BullMQ jobs/invoice PDF, Socket.IO realtime, Redis cache/fallback, rate limiting, ticket/support và Gemini agent với human confirmation. UI customer/kho/support/admin đã nối API. Provider thật, Redis local và performance/cloud chưa nghiệm thu; xem `docs/evidence/external-acceptance-pending.md`.

- [Bộ tài liệu triển khai](docs/README.md)
- [Product spec](docs/01-product-spec.md)
- [Implementation roadmap](docs/07-implementation-roadmap.md)
- [Acceptance checklist](docs/08-acceptance.md)

## Môi trường phát triển

Máy Windows phát triển không dùng Docker Desktop/WSL. M0 sẽ dùng PostgreSQL 16 native và Memurai tương thích Redis API v7. Docker Compose và Redis 7 thật được dùng trên VPS/Linux ở giai đoạn hạ tầng và nghiệm thu cuối.

Tooling hiện có:

```powershell
cd tools
npm ci
npm run docs:check
npm run format:check
```

Xem [hướng dẫn tooling](docs/11-development-tooling.md) để cài MCP, Node 20 và các công cụ kiểm tra.

## Quy trình

Mọi thay đổi triển khai trên branch riêng, qua kiểm tra phù hợp và commit theo Conventional Commits. Có CI tài liệu và workflow ứng dụng (format, lint, typecheck, test, build, integration); deployment VPS sẽ bổ sung ở mốc hạ tầng.

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

- API: `http://127.0.0.1:3000/api/v1/health/live`
- Readiness: `http://127.0.0.1:3000/api/v1/health/ready` (503 nếu DB lỗi; Redis lỗi trả degraded).
- OpenAPI khi phát triển: `http://127.0.0.1:3000/api/docs`
- Web: `http://127.0.0.1:5173`; chọn “Khám phá sản phẩm” để mở catalog, giỏ và đơn hàng. Warehouse/Admin có giao diện điều chỉnh tồn và xử lý đơn.
- Seed tạo customer/warehouse/support/admin tại `<role>@shopfast.test`, dùng `DEV_SEED_PASSWORD` khi tạo mới; chạy lại không reset mật khẩu/tồn. Xem [hướng dẫn seed](docs/evidence/m2-catalog.md).
- Email mặc định dùng adapter development-fake được ghi rõ trong admin queue. Cấu hình EMAIL_PROVIDER_URL/TOKEN để dùng HTTPS provider có idempotency; production từ chối email giả.
- Backend giữ GEMINI_API_KEY và GEMINI_MODEL; thiếu cấu hình trả UNAVAILABLE, không giả câu trả lời. Chạy `npm run smoke:gemini` khi sẵn sàng nghiệm thu.
- PDF hóa đơn lưu riêng trong PostgreSQL, tải bằng bearer và link HMAC có hạn; không đưa JWT vào URL. Worker tạo invoice sau payment, reminder/expiry và report theo Bangkok.

`npm run check` chạy format/lint/typecheck/unit/HTTP contract/build. Integration yêu cầu `TEST_DATABASE_URL` và `TEST_REDIS_URL` riêng rồi chạy `npm run test:integration`; test tạo schema/key/queue riêng và dọn sau khi chạy, không dùng FLUSHDB.

Máy phát triển hiện có PostgreSQL portable ở `tools/.runtime/services/postgresql/pgsql`, DB riêng tại port `55432` và `.env` local đã tạo. Mật khẩu chỉ nằm trong các file gitignored. Cách khởi động/dừng: `powershell -File scripts/local-postgres.ps1 start` hoặc `stop`. Memurai chưa cài xong; xem [evidence M0](docs/evidence/m0-progress.md).

GitHub Actions đã chạy đạt nền tảng M0 với PostgreSQL 16/Redis 7 trên Linux. Các commit triển khai sau đang ở local; chưa push hoặc deploy VPS.

Browser E2E thật: đặt `TEST_DATABASE_URL`, chạy `npm run build:api`, cài Chromium bằng `npx playwright install chromium`, rồi `npm run test:e2e`. Test tự chạy API/web trên port 4300/4173, tạo schema riêng và dọn sau khi chạy. Luồng thật gồm đăng ký/xác minh, reload session, nhập tồn, mua/hủy/mua lại, payment MOCK và DELIVERED; không cần Redis cho bộ test này.
