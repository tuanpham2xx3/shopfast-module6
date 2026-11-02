# Dữ liệu mẫu vận hành

## Catalog để demo phân trang

`demo-catalog.cjs` định nghĩa 42 sản phẩm giả lập: 14 Tai nghe, 14 Loa, 14 Micro.
Ba thương hiệu demo có giá và tồn khác nhau, gồm sáu mẫu hết hàng. Mỗi SKU mới
có một ảnh sản phẩm riêng tải từ Wikimedia Commons, kèm tác giả, nguồn và giấy
phép trong `FE/public/images/products/catalog-v2/sources.json` và `credits.html`.
Đây là ảnh minh họa cho dữ liệu giả lập, không phải cam kết thông số/giá của model
thương mại trong ảnh. Ba sản phẩm gốc được giữ nguyên.

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

## Thay ảnh cho catalog đã có

`tools/scripts/fetch-catalog-images.mjs` tải ảnh theo manifest, kiểm tra SHA-256
và sinh trang ghi công. Ảnh được phục vụ từ frontend của ShopFast để trang sản
phẩm không phụ thuộc hotlink bên ngoài. Kiểm tra trang credits trước khi phát hành.

Sau khi triển khai frontend có đủ ảnh, dùng cùng biến môi trường Admin ở trên:

```sh
node deploy/fixtures/update-demo-images.cjs
node deploy/fixtures/update-demo-images.cjs --apply
```

Script kiểm tra HEAD của mọi ảnh trước khi cập nhật, chỉ đổi `imageUrl` của 42
SKU demo qua API có `expectedVersion`; không đổi giá/tồn. Bản ánh xạ trước thay
đổi lưu trong `.secrets/catalog-images-before.json`. Chạy lại bỏ qua ảnh đã đúng.
Backup DB trước apply và bảo đảm release dùng để rollback cũng phục vụ được thư
mục ảnh mới vì URL ảnh nằm trong DB, độc lập với phiên bản frontend.

## Sửa ticket staging thiếu liên kết đơn

`repair-staging-tickets.cjs` chạy trong container ứng dụng bằng stdin:

```sh
docker exec -i <current-api-container> node - < deploy/fixtures/repair-staging-tickets.cjs
docker exec -i <current-api-container> node - --apply < deploy/fixtures/repair-staging-tickets.cjs
```

Chỉ sửa các fixture khớp chính xác điều kiện trong script, kiểm tra duy nhất một
đơn DELIVERED/PAID của cùng khách, có SKU snapshot. Luôn backup và dry-run trước.
Không dùng script để sửa dữ liệu khách thật.
