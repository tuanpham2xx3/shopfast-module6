# ShopFast — Bộ tài liệu triển khai

Ngày lập: 18/10/2026. Cập nhật28/10/2026: đã có các module ứng dụng và bản deploy HTTPS đầu trên EC2; Gemini/Resend đã có smoke thật, đang hoàn thiện harness, CI/CD, hiệu năng và nghiệm thu. Chưa hoàn tất toàn bộ SRS. Xem [execution ledger](evidence/aws-delivery-progress.md) và kết quả có phạm vi cụ thể trong `docs/evidence/`.

Nguồn yêu cầu: `../Module 06 – Software Requirement Specification (SRS).docx.txt`.

## Cách đọc

1. [Đặc tả sản phẩm và nghiệp vụ](01-product-spec.md).
2. [Mô hình dữ liệu và ranh giới module](02-data-architecture.md).
3. [Hợp đồng HTTP API](03-api-contract.md).
4. [Realtime, cache, rate limit và tác vụ nền](04-runtime-flows.md).
5. [AI Agent với Gemini](05-gemini-agent.md).
6. [UI và các luồng sử dụng](06-ui-flows.md).
7. [Kế hoạch triển khai theo mốc](07-implementation-roadmap.md).
8. [Nghiệm thu, kiểm thử và đối chiếu SRS](08-acceptance.md).
9. [Quy trình dành cho Codex](09-codex-workflow.md).
10. [Quyết định và phạm vi hoãn](10-decisions.md).
11. [Công cụ phát triển, MCP và repo tham chiếu](11-development-tooling.md).

## Thứ tự ưu tiên

- Chỉ dẫn mới nhất của người dùng > SRS gốc > quy tắc nghiệp vụ trong bộ docs > lựa chọn kỹ thuật đề xuất.
- `REQ`: yêu cầu có trong SRS. `DEC`: quy tắc hoặc thiết kế bổ sung để triển khai, chưa phải yêu cầu nguyên văn của đề.
- Người dùng đã chọn Gemini API, key từ Google AI Studio; đã yêu cầu hoãn quyết định hạ tầng.
- Không tự ý coi hoãn hạ tầng là bỏ các tiêu chí triển khai, backup, bảo mật và phục hồi của đề.
- Khi thay đổi hợp đồng hoặc nghiệp vụ, cập nhật tài liệu liên quan và test cùng thay đổi.
- Không tuyên bố đạt hiệu năng hoặc hoàn thành nghiệm thu nếu chưa có kết quả đo thực tế.

## Tiến độ tài liệu

- [x] Phạm vi, phân quyền, trạng thái và luồng nghiệp vụ.
- [x] Data model, API, event, queue và AI contracts.
- [x] UI flows, kế hoạch và bộ tiêu chí nghiệm thu.
- [x] Review vòng 1 ngày 18/10/2026: thống nhất cache theo phạm vi, auth verification, checkout/promo, invoice, AI order lookup, P0/P1/P2 và branch workflow.
- [ ] Các DEC chưa được review trong decision log phải được xác nhận khi tới phần triển khai liên quan.
- [ ] Chọn cấu hình hạ tầng và hoàn thiện kế hoạch vận hành ở giai đoạn sau.
- [ ] Ghi bằng chứng kiểm thử thực tế sau mỗi mốc.

## Đối chiếu gần nhất

- [Runbook deploy, backup và harness](14-deployment-runbook.md).

- [Plan bàn giao end-to-end và đầu vào cần cấp](13-end-to-end-delivery-plan.md).

- [AWS: link mở nhanh khi setup và demo](12-aws-quick-links.md).

- [Rà soát SRS và những phần chưa nghiệm thu](evidence/srs-audit-2026-10-19.md).
- [Gemini agent thật: tool, proposal và xác nhận](evidence/gemini-agent-live.md).
- [Retention và regression khi duyệt phản hồi đồng thời](evidence/retention.md).
- [Coverage: phân biệt unit-only và coverage kết hợp](evidence/coverage-baseline.md).
