# Dữ liệu mẫu vận hành

## Catalog để demo phân trang

`demo-catalog.cjs` định nghĩa 42 sản phẩm giả lập: 14 Tai nghe, 14 Loa, 14 Micro.
Ba thương hiệu demo có giá và tồn khác nhau, gồm sáu mẫu hết hàng. Ảnh dùng lại
ba ảnh minh họa có giấy phép của cửa hàng, không phải ảnh/thông số cam kết cho
từng model thương mại. Ba sản phẩm gốc được giữ nguyên.

`seed-demo-catalog.cjs` gọi API Admin/Inventory để giữ validation, audit tồn,
idempotency và cache invalidation của ứng dụng. Không ghi SQL trực tiếp.

Cấp `DEMO_ADMIN_EMAIL` và `DEMO_ADMIN_PASSWORD` qua môi trường tiến trình riêng,
không ghi credential vào repository. Chạy từ repository root:

```sh
node deploy/fixtures/seed-demo-catalog.cjs
node deploy/fixtures/seed-demo-catalog.cjs --apply
```

Lệnh đầu là dry-run. Có thể cấu hình `SHOPFAST_DEMO_BASE_URL`; mặc định là
`https://shopfast.tuanpq.com`. Khi chạy với API local, đặt thêm
`SHOPFAST_DEMO_IMAGE_ORIGIN` thành origin của frontend, ví dụ
`http://127.0.0.1:5173`, để ảnh trỏ đúng nơi phục vụ static assets.

SKU/slug cố định. Chạy lại bỏ qua sản phẩm đã có, không đặt lại giá/tên/tồn đã
được dùng hoặc chỉnh. Chỉ khởi tạo tồn khi inventory vẫn là version 1, chưa có
tồn/giữ hàng; adjustment dùng idempotency key cố định. Trùng SKU nhưng tên khác
sẽ dừng thay vì ghi đè dữ liệu. HTTP 429 được chờ Retry-After trong giới hạn.

## Sửa ticket staging thiếu liên kết đơn

`repair-staging-tickets.cjs` chạy trong container ứng dụng bằng stdin:

```sh
docker exec -i <current-api-container> node - < deploy/fixtures/repair-staging-tickets.cjs
docker exec -i <current-api-container> node - --apply < deploy/fixtures/repair-staging-tickets.cjs
```

Chỉ sửa các fixture khớp chính xác điều kiện trong script, kiểm tra duy nhất một
đơn DELIVERED/PAID của cùng khách, có SKU snapshot. Luôn backup và dry-run trước.
Không dùng script để sửa dữ liệu khách thật.
