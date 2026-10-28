# Hiệu năng và restore đã chạy — 28/10/2026

Release/source thực thi: `f8d169625a2820f54cdc6214f76dbd9dec7e1f17`, worktree sạch. Không gán các kết quả này cho SHA mới. PR8 chỉ thay harness, test và docs; ứng dụng không đổi nhưng lần đo vẫn giữ nguyên danh tính source gốc.

## Hiệu năng

[Manifest và assertions](runs/69e75dffd2ee06cd/manifest.json) kèm artifact nguyên byte đã kiểm hash và review nội dung, không chứa credential hoặc dữ liệu khách hàng. Runner: `node harness/run.mjs performance`; timestamp report `2026-10-28T12:22:21.041Z`.

Dataset riêng: 200.000 khách, 10.000 sản phẩm, 100.000 đơn. Warmup 120 giây, đo 600 giây. Catalog 50 request/giây rải đều; checkout 10 VU, mỗi VU cách 6,5 giây; 100 socket.

| Phép đo     |    Mẫu |      p95 |      Max |
| ----------- | -----: | -------: | -------: |
| Catalog     | 30.015 |  6,51 ms | 81,07 ms |
| Checkout    |    920 | 16,67 ms | 53,30 ms |
| Second read |     30 | 15,84 ms | 16,07 ms |
| Realtime    |    100 |     9 ms |    14 ms |

Cache hit 96,78%; lỗi 0; request bị rate limit 0. Bộ sinh tải cùng host cạnh tranh CPU với ứng dụng; worker fixture không gửi traffic tới provider. Đây không phải kết quả tải qua Internet từ nhiều vùng hoặc cam kết năng lực production dưới mọi workload.

## S3 restore

[Manifest và assertions](runs/a91198117f40a921/manifest.json). Runner: `node harness/run.mjs backup-restore`; receipt `2026-10-28T12:09:58.032Z`.

Restore hoàn thành trong 7 giây vào DB cô lập. Các kiểm tra thực thi đạt: checksum backup, số dòng bảng khớp, đăng nhập trên dữ liệu restore, đọc đơn, PDF hóa đơn và checksum PDF. Không restore đè DB live. Receipt kiểm timestamp report để không dùng lại báo cáo cũ làm kết quả lần chạy mới.

## Coverage

Full CI profile cùng source chạy cả `npm run test:unit:coverage` và `npm run test:coverage`. Báo cáo trên máy ở `coverage/unit-business/coverage-summary.json` và `coverage/business/coverage-summary.json`; bảng sau là phần tổng hợp đã đọc từ hai file này. Chưa xuất bản đầy đủ HTML/JSON coverage qua bundle này, vì vậy không coi dòng mô tả này là đóng gate published coverage.

| Phạm vi          |  Lines | Statements | Functions | Branches |
| ---------------- | -----: | ---------: | --------: | -------: |
| Unit business    | 60,06% |     59,06% |    45,83% |   40,94% |
| Business kết hợp | 86,74% |     85,22% |    77,34% |   70,64% |

Không tuyên bố tất cả metric unit vượt 60%. Plan vẫn yêu cầu cải thiện unit statements và xuất bản báo cáo đầy đủ. Các kết quả trên không thay cho kiểm định MFA/least privilege, CI negative fixture, slide hoặc diễn tập Q&A.
