# Kịch bản nói 10 phút — deck ShopFast mới

Bám [deck HTML](index.html) và [PDF](shopfast-defense.pdf), cập nhật 02/11/2026.
Lời trong khối trích dẫn là phần nói. Thời gian gồm cả thao tác demo, cần tự bấm giờ
diễn tập; việc có kịch bản không chứng minh đã trình bày đủ 10 phút.

## Chuẩn bị trước khi bấm giờ

- Mở slide; dùng ←/→ chuyển trang, N mở ghi chú, F toàn màn hình.
- Mở Customer, Warehouse, Support, Admin trong **bốn profile/trình duyệt riêng**,
  đăng nhập trước. Các tab cùng profile chia sẻ cookie.
- Customer: giỏ một sản phẩm còn hàng, số lượng 1; chuẩn bị địa chỉ giả.
- Warehouse: mở `/staff/orders`, sẵn một đơn dự phòng đã thanh toán để xử lý tiếp.
- Support: chọn ticket mình được phân công, có mã đơn/SKU và liên kết đúng đơn.
  Có thể dùng [ticket đơn SF202610287D9B1302](https://shopfast.tuanpq.com/staff/tickets/1826ccaa-49b9-4276-9fcd-7907ff736b13).
  Kiểm tra trạng thái/quyền và nhãn thực trước buổi nói; không đặt lại dữ liệu bằng SQL.
- Admin: mở `/admin/operations`; mở sẵn CI xanh, CI test lỗi và báo cáo restore.
- Không chiếu `.env`, `.secrets`, mật khẩu, private key hoặc OTP. Dùng dữ liệu demo.
- Các số CI trên slide thuộc release `378b747`; restore 7 giây thuộc lần chạy 29/10
  trên source `ffcb599`. Không đổi nhãn số đo lịch sử thành số đo release mới.

## 1. 00:00–00:30 — ShopFast

> Em xin trình bày ShopFast, hệ thống mua hàng và hỗ trợ khách hàng cho Module 6.
> Bài trình bày đi theo một đơn hàng: khách đặt mua, kho xử lý, nhân viên hỗ trợ tra cứu và quản trị theo dõi vận hành.
> Hệ thống hiện chạy thật tại tên miền HTTPS trên màn hình.

**Thao tác:** chỉ URL. Không đăng nhập hoặc mở source lúc này.

## 2. 00:30–01:10 — Bài toán

> Sau khi mua, câu khách thường hỏi là “Đơn của tôi đã giao chưa?”.
> Khách cần xem đúng đơn của mình; kho phải cập nhật tiến độ mà không bán vượt tồn; nhân viên hỗ trợ cần dữ liệu để trả lời.
> ShopFast kết nối ba nhu cầu đó trong cùng một luồng, thay vì để mỗi bên theo dõi thông tin riêng.

**Thao tác:** đi theo ba nhóm trên slide, chuyển thẳng sang demo.

## 3. 01:10–03:10 — Một đơn hàng, bốn vai trò

> Em tạo một đơn gồm một sản phẩm. Giá và điều kiện mua được server kiểm tra lại.
> Thanh toán trong bài là mô phỏng, không thu tiền thật.
> Sau đó em chuyển sang tài khoản kho để xử lý đúng mã đơn; bên khách hàng sẽ nhận trạng thái mới mà không cần tải lại trang.

**Thao tác, ưu tiên làm hơn đọc:**

1. Customer mở giỏ → thanh toán → nhập địa chỉ giả → đặt một lần.
2. Mở đơn và **Xác nhận thanh toán mô phỏng**; copy mã đơn.
3. Đặt cửa sổ Customer và Warehouse cạnh nhau.
4. Kho tìm đúng mã, chuyển các bước tiếp theo được UI cho phép: chuẩn bị → giao → đã giao.
5. Chỉ cập nhật ở cửa sổ khách. Đọc kết quả thực đang thấy.

**Mốc cắt:** quá 15 giây chưa tạo được đơn thì dùng đơn dự phòng và nói rõ đó là đơn
đã chuẩn bị. Đến 03:10 chuyển slide 4. Không bấm tạo liên tục hoặc sửa DB để demo.

## 4. 03:10–03:55 — Bảo vệ nghiệp vụ

> Luồng vừa rồi có ba lớp bảo vệ. Giá được backend tính lại; giữ tồn nằm trong transaction DB; idempotency ngăn cùng thao tác tạo thêm đơn.
> Order, phần giữ tồn và outbox được ghi cùng transaction. Vì vậy không chỉ lưu được đơn mà còn ghi nhận được sự kiện cần xử lý tiếp.
> Các ca cạnh tranh và gửi lặp có integration test riêng.

**Thao tác:** lần theo ba ý, chỉ dòng transaction. Không spam checkout live để chứng minh chống trùng.

## 5. 03:55–04:40 — Realtime và công việc nền

> Trạng thái từ kho đi qua API và DB, rồi phát tới khách qua Socket.IO. Room được kiểm quyền theo đơn, không phát đơn của người này cho người khác.
> Việc tạo PDF và gửi email đi qua outbox, queue và worker; không giữ request mua hàng chờ xử lý hết.
> Cache giúp đọc catalog; checkout vẫn kiểm tồn tại DB. Rate limit giới hạn request chung và thao tác nhạy cảm như đăng nhập.

**Thao tác:** chỉ hai luồng trên slide. Nếu còn thời gian mở PDF đã sẵn sàng hoặc
dashboard Admin. Không chạy load test, spam login hoặc tạo lỗi production.

## 6. 04:40–06:50 — AI có dữ liệu và quyền hạn rõ ràng

> Em mở một ticket đã liên kết đúng đơn. Chỉ cần hỏi “Kiểm tra đơn này giúp tôi”.
> Gemini chọn tool; backend kiểm quyền rồi đọc DB. Câu trả lời tiếng Việt được tạo từ kết quả đã xác thực, không lấy lời model làm bằng chứng cho trạng thái đơn.

**Demo A:** hỏi câu sau, chỉ câu trả lời và **Nguồn thông tin**:

```text
Kiểm tra đơn này giúp tôi.
```

> Khi cần kiểm tra tồn, trợ lý dùng SKU. Nếu yêu cầu chưa rõ, trợ lý hỏi thêm thông tin.

**Demo B:** chọn một câu; chỉ hỏi cả hai nếu còn thời gian:

```text
SKU SF-AUDIO-1 hiện còn bao nhiêu hàng?
```

```text
hỗ trợ tôi
```

> Với thao tác ghi, AI chỉ tạo đề xuất. Ticket chưa đổi cho tới khi người có quyền bấm xác nhận. Backend còn kiểm version để tránh ghi đè dữ liệu mới.

**Demo C:** khi nhãn hiện tại khác Giao hàng, hỏi:

```text
Hãy đề xuất đổi nhãn ticket này sang Giao hàng. Chưa thực hiện cho tới khi tôi bấm xác nhận.
```

Chỉ nhãn hiện tại trước xác nhận, bấm **Xác nhận đổi nhãn**, rồi chỉ nhãn mới.
Không cập nhật ticket bằng form khác trong lúc chờ proposal. Nếu nhãn đã trùng,
chọn nhãn khác phù hợp hoặc bỏ nhánh; không nói đã đổi khi không có thay đổi.

**Mốc cắt:** đến 06:50 chuyển slide. Nếu Gemini chờ quá 8 giây/lỗi, dùng
[receipt thật đã lưu](../evidence/2026-11-02-ai-vietnamese-production.md) và nói rõ
đây là kết quả lần chạy trước. Không tự viết đầu ra giả vào màn hình demo.

## 7. 06:50–07:40 — Kiến trúc phục vụ luồng vừa xem

> Backend là Modular Monolith, chia module theo nghiệp vụ, phân tầng theo trách nhiệm.
> API và worker chạy thành hai tiến trình. Em chọn một DB để giữ transaction đơn, tồn và outbox, đồng thời giảm thành phần vận hành.
> Trên AWS, Nginx, API, PostgreSQL, Redis và worker nằm trên một EC2. Backend gọi Gemini và Resend; backup nằm trên S3 riêng tư.
> GitHub Actions build image theo commit rồi deploy qua OIDC và SSM.

**Thao tác:** chỉ sơ đồ. Không mở console AWS hoặc đọc toàn bộ cấu hình máy.

## 8. 07:40–08:35 — Có kiểm chứng, không chỉ có demo

> Bộ CI của release được ghi trên slide có 153 test unit/integration và 19 ca trình duyệt đạt.
> Em mở thêm một lần test cố ý sai: assertion thất bại, pipeline đỏ và PR bị chặn, không merge vào production.
> Coverage tách unit và bộ kết hợp. Mỗi báo cáo giữ nguồn và commit của lần chạy, không dùng phần trăm kết hợp thay cho độ phủ unit.

**Thao tác:** mở [CI xanh](https://github.com/tuanpham2xx3/shopfast-module6/actions/runs/41388066603),
rồi [CI test đỏ](https://github.com/tuanpham2xx3/shopfast-module6/actions/runs/40690998876).
Chỉ assertion Jest. Không lấy lỗi format làm ví dụ test nghiệp vụ thất bại.

## 9. 08:35–09:30 — Backup phải dùng được

> Backup được lưu riêng trên S3. Trong diễn tập, hệ thống tải backup, kiểm checksum và restore vào DB cô lập.
> Sau đó kiểm số bản ghi, đăng nhập, đọc đơn và đối chiếu PDF hóa đơn. Lần ghi nhận trên slide mất 7 giây, thuộc ngày 29/10; không phải cam kết thời gian cho mọi dung lượng.
> Với deploy, candidate phải qua health trước khi chuyển bản và giữ bản cũ để phục hồi. Một EC2 vẫn là giới hạn khi mất cả host.

**Thao tác:** mở [biên bản restore](../evidence/2026-10-29-structure-production.md)
và chỉ các mục xác minh. Không rollback, reboot hoặc restore đè DB live trong bài nói.

## 10. 09:30–10:00 — Kết thúc

> ShopFast kết nối việc mua hàng, xử lý kho và hỗ trợ khách bằng dữ liệu chung có kiểm quyền.
> Website, mã nguồn, lịch sử CI và bằng chứng được chuẩn bị để đối chiếu.
> Bản này dùng một EC2, thanh toán mô phỏng và đối tác demo. Các gate chưa có minh chứng vẫn được ghi riêng, không khẳng định toàn bộ SRS đã đạt.
> Em xin kết thúc và nhận câu hỏi.

**Thao tác:** dừng đồng hồ ở 10:00, không nối thêm phần mở source dài.

## Khi chậm hoặc gặp lỗi

| Tình huống                | Xử lý                                                                            |
| ------------------------- | -------------------------------------------------------------------------------- |
| Checkout chưa xong        | Dùng đơn chuẩn bị, nói đúng rằng lần tạo live chưa hoàn tất.                     |
| Socket chưa cập nhật      | Kiểm trạng thái bằng tải lại/REST; không gọi thao tác đó là realtime thành công. |
| AI chậm/lỗi               | Mở receipt/ảnh có nguồn và ngày chạy; bỏ lượt hỏi tiếp theo.                     |
| Proposal hết hạn/xung đột | Giải thích kiểm tra dữ liệu mới; không bỏ guard để demo.                         |
| Trễ mốc 06:50             | Bỏ câu hỏi bổ sung, giữ giải thích human confirmation rồi chuyển kiến trúc.      |
| Trễ mốc 08:35             | Bỏ xem log chi tiết, chuyển restore.                                             |
| Chỉ còn 30 giây           | Chuyển slide 10 và kết thúc.                                                     |

## Ghi nhận sau khi tự tập

- Ngày/giờ và release dùng để tập: …
- Thời gian thực tế: …
- Mốc vượt thời gian: …
- Demo live đạt / bước dùng bằng chứng dự phòng: …
- Link không mở được, câu Q&A chưa trả lời được: …
- Điều chỉnh cho lần tập tiếp: …
