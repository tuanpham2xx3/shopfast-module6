# ShopFast Module 6

ShopFast là bài Defense Case Study Module 6: backend thương mại điện tử bằng NestJS/PostgreSQL, bổ sung Gemini AI Agent, realtime order tracking, rate limiting, Redis cache, BullMQ background jobs và UI web tối thiểu để demo.

## Trạng thái

Dự án đang ở giai đoạn đặc tả và chuẩn bị triển khai M0. Chưa có mã ứng dụng hoặc deployment production.

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

Mọi thay đổi triển khai trên branch riêng, qua kiểm tra phù hợp và commit theo Conventional Commits. CI hiện kiểm tra tài liệu; các job lint, test, build và deployment sẽ được bổ sung cùng source ứng dụng.
