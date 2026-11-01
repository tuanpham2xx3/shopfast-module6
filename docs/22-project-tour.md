# Mở project khi trình bày

Mở thư mục repository bằng VS Code/Cursor. Workspace settings trong `.vscode/settings.json` ẩn dependency, build/report, runtime portable và secrets khỏi cây Explorer; gom cấu hình dưới `package.json`, SRS gốc và hướng dẫn agent dưới `README.md`. Đây là cách hiển thị: dữ liệu vẫn ở nguyên đường dẫn, không xóa receipt, database hoặc credential.

## Thứ tự mở source

| Phần trình bày | Đường dẫn                                                            | Nội dung                                                                |
| -------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Tổng quan      | [README](../README.md), [cấu trúc](19-repository-structure.md)       | Stack, phạm vi và ranh giới ứng dụng                                    |
| API / worker   | [API](../apps/api/src), [worker](../apps/worker/src)                 | Bootstrap, composition và scheduler                                     |
| Nghiệp vụ      | [Modules](../libs/modules)                                           | Chọn orders/tickets/ai; đi từ HTTP → application → persistence/adapters |
| Database       | [Migrations](../database/migrations)                                 | Constraint, version, transaction và dữ liệu seed                        |
| Frontend       | [Web](../apps/web/src)                                               | app, features và shared                                                 |
| Kiểm thử       | [Tests](../tests), [harness](../harness)                             | Unit/integration/browser; receipt có SHA và gate rõ ràng                |
| Triển khai     | [Deploy](../deploy), [CI/CD](../.github/workflows)                   | Containers, Nginx, release/backup và workflow                           |
| Minh chứng     | [Release đã kiểm chứng](evidence/2026-10-29-structure-production.md) | Phạm vi PASS, retry Gemini và giới hạn của lần chạy 29/10               |

## Khi demo

- Mở website [ShopFast](https://shopfast.tuanpq.com), [kịch bản 10 phút](18-defense-walkthrough.md) và [slide](defense/README.md).
- Mở cấu hình mẫu `.env.example` nếu cần giải thích biến môi trường; không mở `.env` hoặc `.secrets` khi chia sẻ màn hình. Cấu hình Explorer không phải cơ chế bảo mật và không chặn mở file trực tiếp.
- Các kết quả nghiệm thu có ngày/SHA riêng, không được coi là một lần kiểm tra live mới chỉ vì mở lại project.
- Muốn xem lại file đang ẩn, sửa các mục `files.exclude` tương ứng thành `false` trong `.vscode/settings.json`. Không cần chuyển file hoặc cài lại dependency.

Việc làm gọn để trình bày không thay API, cấu trúc source, migration, lệnh build/test hoặc deployment. `dist`, `node_modules`, `harness/reports` và native runtime vẫn còn để dùng khi cần.
