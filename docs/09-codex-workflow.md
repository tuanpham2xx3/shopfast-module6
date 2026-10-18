# 09 — Quy trình làm việc dành cho Codex

## 1. Trước khi sửa code

1. Đọc README docs, file nghiệp vụ/module liên quan, decision log và chỉ dẫn người dùng mới nhất.
2. Xác định mốc trong roadmap và case nghiệm thu bị tác động; kiểm tra source hiện có, không scaffold lại phần đã tồn tại.
3. Nếu khác docs: cập nhật quyết định và chỉ rõ ảnh hưởng API/data/test trước khi thay đổi contract. Không tự biến giả định DEC thành yêu cầu người dùng đã xác nhận.
4. Lập task nhỏ theo vertical use case; không triển khai hạ tầng cloud khi người dùng đang hoãn.
5. Không thêm payment thật, microservices, vector DB, provider AI khác hoặc chức năng ngoài phạm vi mà không có yêu cầu.

## 2. Trình tự cho một use case

- Chốt DTO, quyền, rule, transaction boundary và lỗi trước.
- Migration và DB constraint cho invariant quan trọng; không chỉ validate ở UI.
- Viết test có giá trị cho rule/race/failure trước hoặc cùng phần xử lý; không tạo test chỉ lặp nguyên implementation.
- Service/repository → HTTP/event/job adapter → UI; không để controller chứa nghiệp vụ.
- Kiểm tra dependency outage và retry nếu use case có external effects.
- Chạy checks liên quan và cập nhật evidence; sau đó mới đánh done.

## 3. Definition of Done

- Luồng happy path và lỗi chính hoạt động end-to-end, không còn mock ngầm trong đường chạy được tuyên bố thật.
- Quyền HTTP, socket và tool được kiểm tra server-side.
- Invariant có transaction/constraint, idempotency theo đúng contract.
- OpenAPI, docs và migration khớp implementation.
- Test phù hợp pass; ghi lệnh/commit/result, không giả PASS.
- Không có secret/PII thừa trong source/log/UI; seed chỉ dữ liệu giả.
- Code build được; sau mỗi phần triển khai hoàn chỉnh và checks đạt thì tạo local commit theo mục 6. Không tự push/deploy.

## 4. Khi thiếu thông tin

Ưu tiên đọc docs/source để tự giải quyết lựa chọn nhỏ, reversible. Với thay đổi ảnh hưởng thanh toán, quyền dữ liệu, giữ tồn, API public hoặc tính đúng của cache, nêu rõ câu hỏi và không tự bỏ invariant. Có thể tiếp tục phần độc lập.

Không đổi SLA để làm test pass. Không bỏ test lỗi. Không dùng sleep dài để test lịch; dùng injected clock. Không dùng cache/AI output làm source of truth cho order/payment/inventory.

## 5. Bàn giao mỗi mốc

Tóm tắt cái đã hoạt động, files chính, checks đã chạy và kết quả; liệt kê giới hạn còn lại và bước kế tiếp. Cập nhật trạng thái mốc/evidence bằng dữ liệu thực tế. Không ghi “hoàn thành dự án” khi hạ tầng còn hoãn hoặc provider thật chưa nghiệm thu.

## 6. Chính sách commit cho mỗi lần triển khai

Áp dụng từ 18/10/2026: tự commit local sau mỗi phần việc hoàn chỉnh đã kiểm tra đạt. Một lần triển khai là một task/use case có thể review độc lập, không phải mỗi lần sửa file hay gọi công cụ. Mốc lớn có thể có nhiều commit.

1. Trước task, xem branch/status/diff và ghi nhận thay đổi có sẵn của người dùng; không đưa chúng vào commit nếu không thuộc task.
2. Viết code, migration, docs và test cần thiết; chạy checks phù hợp. Khi chưa scaffold ứng dụng, thay đổi docs/tooling chỉ cần checks tương ứng, không yêu cầu build sản phẩm chưa tồn tại.
3. Review diff, secret và file sinh tự động; chỉ stage các đường dẫn thuộc task. Không stage node_modules, runtime portable, repo tham chiếu, env hoặc reports thô.
4. Xem staged diff và `git diff --cached --check`; checks thất bại thì sửa trước, không commit như đã hoàn tất. Nếu bị chặn, báo trạng thái, không tạo commit giả thành công.
5. Commit theo Conventional Commits: `feat(auth): ...`, `fix(orders): ...`, `test(inventory): ...`, `docs(spec): ...`, `chore(tooling): ...`. Commit message nêu hành vi cụ thể, không chỉ ghi “implement” hoặc “update”.
6. Bàn giao kèm commit hash, nội dung và checks đã đạt; xác nhận không còn thay đổi của task bị bỏ sót.

Không tự push, amend commit đã có, reset, force-push hoặc sửa lịch sử. Nếu hook fail, sửa nguyên nhân và chạy lại; không dùng --no-verify để bỏ qua. Không tạo commit rỗng khi không có thay đổi.

ShopFast dùng repository GitHub độc lập. Không triển khai sản phẩm trực tiếp trên `main`: tạo branch riêng theo mốc/task trước thay đổi đầu tiên. Chỉ commit file thuộc ShopFast, không stage thay đổi từ repository cha hoặc dự án khác. Không tự push/deploy ngoài phạm vi người dùng đã yêu cầu; tuân theo branch protection/PR workflow khi được thiết lập.
