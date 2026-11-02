# Gom source BE/FE

Ngày 02/11/2026. Phạm vi: sắp xếp local theo yêu cầu, không deploy hoặc thay tài nguyên cloud.

| Cũ            | Mới         |
| ------------- | ----------- |
| apps/api      | BE/api      |
| apps/worker   | BE/worker   |
| libs/modules  | BE/modules  |
| libs/platform | BE/platform |
| database      | BE/database |
| tests         | BE/tests    |
| scripts       | BE/scripts  |
| apps/web      | FE          |

Giữ npm commands ở gốc, workspace frontend tên `@shopfast/web`. Cập nhật TypeScript/Nest/Jest/Playwright, alias, npm lock workspace link, Docker/Compose, compiled-path consumer, native helpers, architecture checker, source links và registry acceptance hash. Không nâng dependency hoặc thay request/transaction/schema.

## Kiểm tra đã thực thi

- `npm run check`: format, architecture, lint, typecheck, 17 suites / 68 tests và API/worker/web build PASS. Sau review, rule/startup suite có 8 tests PASS (6 boundary fixtures và 2 Nest entrypoint tests).
- `npm run test:integration`: 16 suites / 69 tests PASS, PostgreSQL16/Memurai native.
- Harness self-test: 22/22 PASS; registry giữ 62 requirements / 49 acceptance cases. Lần đầu phát hiện acceptance source hash thay đổi vì cập nhật đường dẫn tài liệu; rebuild registry rồi self-test đạt.
- Docs links/format và harness source parser PASS.
- Snapshot cuối từ Git index được extract vào thư mục ignored và chạy toàn bộ `npm run check` PASS: 8 architecture/startup tests, lint/typecheck, 68 unit/contract tests và API/worker/web build. Không dựa vào `dist` cũ hoặc các chỉnh sửa Auth ngoài index để chứng minh bản commit.
- Playwright global setup lúc đầu còn `./tests/e2e/setup.ts`; đã đổi `./BE/tests/e2e/setup.ts`. Browser suite sau sửa final compiled paths đạt 19/19 trong 1.7 phút, gồm bootstrap API thật trên schema test riêng.

Review phát hiện Nest watch/start không khớp output root khi chỉ đổi sourceRoot. Hai regression tests intercept child launch, không khởi động worker hoặc gọi provider: RED trên config cũ, GREEN sau khi compiler root và output `dist/BE/...` khớp Nest sourceRoot. Hai entrypoint compiled thực tế tồn tại sau build. Sửa cả default Jest coverage, FE lint/format trong harness và publication compatibility roots sang BE/FE; không coi bundle lịch sử tương thích tự động.

## Bảo toàn thay đổi có sẵn

Trước task đã có AuthService chuyển từ application sang composition cùng import ở runtime/tests. Đã lưu patch/preimage trong ignored `.secrets`, chuyển chúng theo cây BE và kiểm tra nội dung implementation Auth giữ nguyên ngoài import. Index chỉ chứa phiên bản baseline đã chuyển đường dẫn; Auth delta vẫn để unstaged/untracked tại vị trí BE tương ứng, không bị nhận làm implementation của task.

Native runtime/data trong `tools/.runtime`, credentials trong `.secrets`, dependency/build outputs và receipt lịch sử giữ nguyên. Không chỉnh byte/hash của evidence lịch sử. Các phép đo/production PASS ngày 29/10 không được chuyển nhãn sang layout mới; CI Linux, image execution và deployment mới chưa chạy trong task local này.
