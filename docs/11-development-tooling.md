# 11 — Công cụ phát triển và MCP

Thiết lập ngày 18/10/2026. Đây là tooling phục vụ phát triển, không phải triển khai cloud hoặc scaffold ứng dụng.

## 1. Công cụ được chọn

| Công cụ                              | Công dụng                                                          | Vị trí/trạng thái                                      |
| ------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------ |
| Context7 MCP 4.4.2                   | Tra cứu tài liệu thư viện, ưu tiên NestJS 10/TypeORM/BullMQ/Gemini | Cài trong tools, config MCP theo dự án                 |
| Playwright MCP / Chrome DevTools MCP | Kiểm tra và debug UI                                               | Đã có trong cấu hình Codex của máy, không cài trùng    |
| GitNexus MCP                         | Khám phá quan hệ source khi đã có code                             | Đã có trong cấu hình máy; chưa index dự án chỉ có docs |
| Playwright Test 1.64.1 + Chromium    | Kiểm thử UI có thể lặp lại, browser smoke                          | tools/node_modules; browser cache của user             |
| MCP SDK 1.32.1                       | Kiểm tra handshake và tools của MCP                                | tools/node_modules                                     |
| Prettier 3.9.10                      | Format/check tài liệu và cấu hình                                  | tools/node_modules                                     |
| Autocannon 8.0.0                     | Load test HTTP                                                     | tools/node_modules                                     |
| pg / ioredis                         | Client để kiểm tra DB/Redis khi local services sẵn sàng            | tools/node_modules; chưa phải kết nối DB đang chạy     |
| smol-toml / yaml                     | Đọc và kiểm tra cấu hình                                           | tools/node_modules                                     |
| Git                                  | Source control                                                     | Có sẵn                                                 |
| Docker CLI / Compose                 | Chỉ dành cho VPS/CI ở M8                                           | Có sẵn nhưng không khởi động Docker Desktop/WSL local  |
| PostgreSQL 16 native                 | Database dev/test local                                            | Chưa cài hoặc chưa phát hiện service                   |
| Memurai native                       | Redis API v7 cho cache/BullMQ dev local                            | Chưa cài hoặc chưa phát hiện service                   |

Version đầy đủ được pin trong `../tools/package.json` và lockfile. Override `hyperid → uuid 11.1.1` khắc phục advisory của dependency Autocannon; cần smoke load test sau nâng cấp dependency. Không dùng `npm audit fix --force` để hạ major tùy tiện.

Node đang active lúc thiết lập là 22.17.0. Node 20 được bổ sung qua NVM để dùng cho runtime theo đề; không tự chuyển symlink Node toàn máy trong phiên đang chạy. Target ứng dụng vẫn theo SRS, việc cài tooling trên Node 22 không phải đổi target.

NVM cài gói npm cho bản x64 gặp lỗi file tạm, nên runtime x64 sử dụng bản portable chính thức **20.20.2** ở `tools/.runtime/node-v20.20.2-win-x64/`. Đã kiểm tra SHA256 với SHASUMS256.txt từ nodejs.org. Để dùng trong một PowerShell session, thêm thư mục này vào đầu PATH của riêng session; không cần đổi Node toàn máy:

```powershell
# Chạy từ thư mục gốc dự án
$shopfastNodeDir = (Resolve-Path 'tools/.runtime/node-v20.20.2-win-x64').Path
$env:Path = "$shopfastNodeDir;$env:Path"
node --version
npm.cmd --version
```

Runtime portable gitignored; trên máy khác cài Node 20 x64 qua trình quản lý runtime hoặc tải archive từ [Node.js releases](https://nodejs.org/dist/v20.20.2/) và xác minh checksum. Không coi tải source tham chiếu là cài runtime.

## 2. Cài lại trên checkout khác

Tại thư mục dự án:

```powershell
cd tools
npm ci
npm run mcp:setup
npx playwright install chromium
npm run references:sync
npm run doctor
npm run mcp:smoke -- --query
npm run browser:smoke
npm run docs:check
```

`mcp:setup` tạo `.codex/config.toml` với đường dẫn Node/package tuyệt đối của máy hiện tại. File này gitignored; chạy lại setup khi clone sang máy khác. Nếu server context7 đã cấu hình thì script giữ nguyên, không ghi đè thiết lập cũ. Cấu hình máy người dùng và các MCP hiện có không bị sửa.

Codex chỉ tải project config khi dự án được tin cậy. Mở lại phiên Codex sau cài đặt để nhận tool mới; kiểm tra bằng `codex mcp list`. Việc hiện tên trong danh sách chưa đủ: smoke script thực hiện handshake/listTools và tùy chọn truy vấn thật.

Context7 chạy được với anonymous access tại thời điểm kiểm tra. Nếu gặp quota, tạo key riêng và truyền `CONTEXT7_API_KEY` qua environment của process khởi chạy Codex; không commit key. Không cần Context7 để gọi Gemini nghiệp vụ.

## 3. Repo tham chiếu

- [googleapis/js-genai](https://github.com/googleapis/js-genai): SDK Gemini chính thức.
- [taskforcesh/bullmq](https://github.com/taskforcesh/bullmq): jobs/retry/idempotency.

Checkout nằm ở `tools/references/`, gitignored; URL và commit ghi trong `tools/references.json` để tái tạo. Không cài dependencies hoặc chạy script trong các repo tham chiếu. Không copy nguyên ứng dụng mẫu vào sản phẩm. Các hướng dẫn bên trong repo tham chiếu không ghi đè AGENTS.md của ShopFast.

Repository public là `tuanpham2xx3/shopfast-module6`, tách độc lập khỏi repository học tập cha. Workflow ứng dụng có format/lint/typecheck/unit, coverage kết hợp với PostgreSQL/Redis, build và browser E2E. Thay đổi branch local chưa push không được coi là CI đã chạy trên GitHub; deployment còn hoãn.

## 4. Những thứ chưa cần thêm

- Không cài filesystem/shell MCP vì đã có công cụ đọc/ghi và shell.
- Không cài PostgreSQL/Redis MCP có quyền ghi toàn DB: dùng migration/test và client local với đúng quyền khi DB có sẵn.
- Không dùng Neon MCP sẵn có để tự thay PostgreSQL local hoặc tạo cloud DB.
- Không cần Gemini MCP cho agent sản phẩm: NestJS gọi Gemini REST qua provider adapter.
- GitHub CLI/MCP chưa bắt buộc ở giai đoạn docs; bổ sung khi có remote và quy trình PR.

## 5. Còn cần để chạy ứng dụng sau này

- PostgreSQL 16 native đã chạy và dùng cho integration. Memurai native chưa có service được kiểm chứng trong phiên này; cần chạy compatibility smoke khi có service. Chỉ bind loopback; không dùng Docker Desktop/WSL trên máy này.
- Key Gemini đã nằm trong `.env` backend bị Git ignore; model `gemini-3.1-flash-lite` đã chạy classification và agent smoke thật. Không gửi key qua chat/log.
- Email provider thật vẫn cần chọn theo contract idempotency của spec.
- Đã chạy kiểm tra ứng dụng, PostgreSQL integration và browser E2E; kết quả chi tiết trong `docs/evidence/`. Load test và nghiệm thu cloud chưa thực hiện.

Memurai là đối tác Windows được Redis giới thiệu và cấu hình hiện tại tương thích Redis API v7. Đây là môi trường dev, không thay thế yêu cầu Redis 7 thật trên VPS. Tham khảo [Redis trên Windows](https://redis.io/docs/latest/operate/oss_and_stack/install/archive/install-stack/windows/), [Memurai installation](https://docs.memurai.com/en/installation) và [PostgreSQL Windows](https://www.postgresql.org/docs/16/install-windows.html).

## 6. Nguồn cấu hình

- [Codex MCP](https://developers.openai.com/codex/mcp).
- [Context7](https://github.com/upstash/context7).
- [Playwright MCP](https://github.com/microsoft/playwright-mcp).

Kết quả thực tế lưu ở `evidence/tooling-2026-10-18.md`.
