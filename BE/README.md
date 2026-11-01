# Backend ShopFast

Backend dùng NestJS/TypeScript, PostgreSQL và Redis; API và worker dùng chung các module.

```text
BE/
  api/          HTTP bootstrap, module composition và lifecycle
  worker/       Worker, scheduler và outbox processing
  modules/      Auth, catalog, orders, tickets, AI, jobs, runtime...
  platform/     Config, database, health và outbox dùng chung
  database/     Migration và seed
  tests/        Unit, contract, integration, runtime và browser E2E
  scripts/      Native services, doctor và smoke helpers
```

Lệnh chạy từ **gốc repository**, dùng `package.json` chung:

```powershell
npm run dev:api
npm run dev:worker
npm test
npm run test:integration
```

Xem [README gốc](../README.md) để cấu hình local/test DB. Native runtime vẫn nằm tại `tools/.runtime`; không cài/chạy Docker Desktop hoặc WSL trên máy dev. Build backend xuất ra `dist/BE/api`, `dist/BE/worker`, `dist/BE/modules` và `dist/BE/platform`; các consumer trong deploy/harness được cập nhật theo đó.
