# ShopFast Module 6

ShopFast là bài Defense Case Study Module 6: backend thương mại điện tử bằng NestJS/PostgreSQL, bổ sung Gemini AI Agent, realtime order tracking, rate limiting, Redis cache, BullMQ background jobs và UI web tối thiểu để demo.

## Trạng thái

Dự án đang triển khai M0 trên branch `feat/m0-foundation`: đã có API NestJS, worker BullMQ, web React và migration PostgreSQL. Chưa nghiệm thu M0 hoặc triển khai production.

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

Yêu cầu Node 20, PostgreSQL 16 native và Memurai tương thích Redis API 7. Tạo database/user riêng, chỉ bind loopback; điền URL vào `.env` theo `.env.example`. Không commit `.env`.

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
- Web placeholder: `http://127.0.0.1:5173`
- Seed M0 tạo một outbox email giả; worker ghi nhận vào `fake_deliveries` và `job_executions`. Chưa gửi email thật.

`npm run check` chạy format/lint/typecheck/unit/HTTP contract/build. Integration yêu cầu `TEST_DATABASE_URL` và `TEST_REDIS_URL` riêng rồi chạy `npm run test:integration`; test tạo schema/key/queue riêng và dọn sau khi chạy, không dùng FLUSHDB.

Máy phát triển hiện có PostgreSQL portable ở `tools/.runtime/services/postgresql/pgsql`, DB riêng tại port `55432` và `.env` local đã tạo. Mật khẩu chỉ nằm trong các file gitignored. Cách khởi động/dừng: `powershell -File scripts/local-postgres.ps1 start` hoặc `stop`. Memurai chưa cài xong; xem [evidence M0](docs/evidence/m0-progress.md).

GitHub Actions đã có workflow ứng dụng dùng PostgreSQL 16/Redis 7 trên Linux; workflow này chưa được push/chạy trên GitHub. Không có thao tác deploy VPS.
