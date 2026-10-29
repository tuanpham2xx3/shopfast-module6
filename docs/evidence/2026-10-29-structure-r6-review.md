# R6 — Review và regression trước release

29/10/2026. Review độc lập toàn branch từ `origin/main`, source checkpoint `90cb6aa` và fix sau `aa03172`.

Reviewer kiểm SQL/executor/control flow của Auth/Orders/Tickets/AI/Jobs, contract controller/guard/DTO, wiring Google provider trong API/worker, session/focus/cart key frontend và đường dẫn runtime. Không còn Critical/Important; không có minor bị hoãn. Live deployment là gate riêng của implementer.

## Finding và kiểm chứng fix

Collector published-artifacts dùng đường dẫn mới để đọc commit lịch sử nên git rev-parse có thể throw trước khi ghi receipt. Tách compareSourceTrees, giữ execution SHA và đọc alias đường dẫn lịch sử; missing path luôn incompatible, không so hai null thành PASS.

Test mới được chạy RED khi helper chưa có; sau fix harness self-test GREEN 22/22, source parser PASS 43 files. Collector thực thi với bundle `d4fe2524d32fcd8c2cbe624e011b97279162d97a` giờ ghi receipt FAIL đúng nghĩa do backend/config khác, thay vì crash hoặc gán lại execution SHA. Không chỉnh receipt cũ để thành PASS.

Staging baseline đã thực thi phát hiện assertion `/login` chờ tiêu đề đăng ký. Sửa expectation thành “Đăng nhập”, không sửa product behavior. Chạy lại trên release trước refactor `f252c86a20b28c90a754a15a500f7ea43ab655e2`: 10 end-to-end checks PASS, gồm email OTP, order/idempotency/socket, invoice PDF, ticket, Gemini tools/replay và UI mobile. Đây là baseline/fixture cho continuity, không phải proof candidate đã deploy.

## Rulings và giới hạn

- Giữ workspace/feature branch hiện có và các checkpoint thay vì tạo checkout/runtime native mới; không triển khai trên main.
- Dùng regression suite hiện có để giữ hành vi trong file moves; thêm negative/positive tests cho architecture và historical path compatibility.
- Giữ installed entrypoint VPS nhưng cài lại nội dung từ source mới, gồm resilience/redis-outage/performance collector CJS. Giữ bản trước để rollback.
- Evidence lịch sử không di chuyển. Refactor không đóng các gate SRS provider/IAM/human QA khác bằng suy luận.

Logs ignored `.secrets/structure-review-*.log`, `.secrets/structure-staging-before*.log`. CI Linux và production evidence được bổ sung theo SHA sau release.

## CI phát hiện fixture auth thiếu mock

CI `40874907101` và `40875297199` thất bại tại test UI đăng ký/xác minh: token giả `access-token` được dùng cho request giỏ hàng chạy nền nhưng fixture chỉ mock auth, nên backend thật trả 401 và session bị xóa. Reproduce local bằng cách chờ response cart rồi assert success: RED nhận false. Bổ sung fixture cart rỗng và giữ bước chờ response; chạy hai ca auth lặp ba lần GREEN 6/6 trong 16.3 giây. Không thay xử lý 401 trong sản phẩm, không bỏ assertion và không tăng timeout. CI mới phải chạy lại đầy đủ trước merge.
