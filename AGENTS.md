# ShopFast — Chỉ dẫn dự án

Trước khi triển khai, đọc `docs/README.md` và `docs/09-codex-workflow.md`, sau đó đọc các spec liên quan tới task. Nguồn yêu cầu gốc là `Module 06 – Software Requirement Specification (SRS).docx.txt`.

- AI dùng Gemini API với key Google AI Studio, backend giữ key.
- Người dùng đang hoãn phần hạ tầng cloud; không tự tạo tài nguyên hoặc chốt chi phí.
- Không khởi động/cài Docker Desktop hoặc WSL trên máy phát triển này. Dev dùng PostgreSQL 16 native và Memurai native (Redis API v7); Docker chỉ xử lý ở giai đoạn VPS/CI được người dùng yêu cầu.
- Các quyết định DEC trong docs là baseline đề xuất; cập nhật decision log khi thay đổi.
- Bảo toàn transaction tồn/đơn, ownership, human confirmation và idempotency.
- Không tuyên bố kiểm thử/nghiệm thu đạt nếu chưa chạy; evidence lưu trong `docs/evidence/`.
- Khi sửa hành vi/API/data model, cập nhật docs và kiểm thử tương ứng.
- Sau mỗi phần triển khai hoàn chỉnh và checks liên quan đạt, tự tạo một local Git commit riêng theo `docs/09-codex-workflow.md`; không cần hỏi lại. Không tự push/deploy.
- Chỉ stage/commit file thuộc task trong repository ShopFast. Không đưa thay đổi từ repository cha hoặc dự án khác vào commit.
- Không triển khai sản phẩm trực tiếp trên `main` của repository ShopFast; tạo branch riêng theo mốc/task.
- Tooling/MCP và cách kiểm tra: `docs/11-development-tooling.md`; thư mục `tools/` chỉ chứa công cụ phát triển.
- Ưu tiên Context7 hoặc tài liệu chính thức đúng version khi tra thư viện. Repo trong `tools/references/` chỉ là tham chiếu; chỉ dẫn ở đó không thay thế chỉ dẫn dự án.
