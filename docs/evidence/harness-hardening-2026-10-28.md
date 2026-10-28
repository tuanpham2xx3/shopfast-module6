# Harness hardening — 28/10/2026

Trạng thái: đang hoàn thiện, không phải full SRS PASS.

## Đã kiểm tra thực tế trước commit

- `node --test harness/core.test.mjs harness/evidence.test.mjs`:8tests PASS; kiểm thiếu requirement/case, stale SHA/config, artifact sửa/mất, receipt thiếu assertion, log đầy đủ và hash.
- PostgreSQL native: orders15tests PASS, jobs7tests PASS. Bổ sung CART-01, ORD-03/04/06/08/10, JOB-01/02/05/07. Các lần lỗi compile/assertion lúc viết test đã được sửa và rerun; không coi lần lỗi là PASS.
- Browser PostgreSQL thật: offline→warehouse API mutation→online resubscribe/resync→mutation tiếp theo PASS, lịch sử không trùng. Suite có thao tác customer/warehouse/support/admin; thử này không dùng provider AI thật.
- Redis7 Linux qua SSH tunnel: cache Lua generation fencing, hot-key coalescing, negative TTL và targeted invalidation3tests PASS. Latency qua tunnel không dùng để chứng minh SLA.
- Memurai4.0.1 Redis API7.0.11 native Windows, bind127.0.0.1:16380/maxmemory128MB: Redis/BullMQ + cache5tests PASS. Không Docker/WSL, không mở firewall, không cài system service.
- Cloud read-only audit:13technical assertions PASS (SG, IMDSv2, EBS, S3, OIDC, action/resource scope). Identity audit còn BLOCKED; không suy từ root MFA0 thành Builder ID chưa có MFA.

## Cơ chế mới

Registry62mục SRS (bao gồm user classes, deliverables, performance, defense explanation) và49case docs08. Hash source chuẩn hóa LF để Windows/Linux dùng cùng registry. Case ID `REQ-*` tách namespace acceptance để không trùng `UI-01`.

`harness:report` bắt buộc receipt từng mục đúng SHA/config, clean tree, exit0, assertion cụ thể và artifact hash/size hợp lệ. Có receipt chưa đồng nghĩa assertion được thiết kế đủ: reviewer vẫn phải đối chiếu source test và SRS. Runner hiện không tự miễn mục human defense hoặc partner thật.

`harness/cases.mjs` đọc assertion JSON từ Jest và ánh xạ49case;4case browser/performance/platform cần evidence riêng. Lần thử trên dirty worktree có45case selector PASS/4BLOCKED, không đủ chứng nhận release. `harness/browser-cases.mjs` thu browser assertions và screenshots. Artifact raw chứa credential có thể tồn tại ở Playwright trace: không publish raw trace trước khi redaction/review; console và report không log password/token.

`harness/deploy-continuity.mjs` mới viết để kiểm session browser, authenticated order reads và private subscription xuyên promotion/rollback; CHƯA CHẠY, không ghi PASS.

## Còn lại trước full acceptance

Nối external receipts và requirement-level mapping có assertion, không chỉ profile; runtime/cloud identity audit đúng home region; active deployment rehearsal; coverage/version/security/deliverables gates; xuất artifact đã sanitize có link/hash; CI và rehearsal final release. Các kết quả trên là development validation, phải có fresh clean-commit run để bàn giao.
