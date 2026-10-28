# 15 — Cải thiện UI/UX ShopFast

Ngày28/10/2026. Yêu cầu: làm giao diện đẹp, đầy đủ hơn và tải ảnh còn thiếu về dự án.

## Audit và hướng thiết kế

- Giữ thương hiệu ShopFast và màu xanh. Bản trước dùng Segoe/system font, tiêu đề lớn, nút điều hướng cùng trọng lượng với CTA; form admin một cột quá dài.
- Catalog có3sản phẩm Audio với URL ảnh `example.com/product.jpg`; UI cũ chỉ hiện chữ cái danh mục. Ảnh được bổ sung từ Wikimedia Commons, lưu local cùng provenance.
- Giữ label điều hướng, tên/order trường và các luồng đăng ký, OTP, checkout, kho, ticket và human confirmation. Mức thay đổi vừa phải; motion chỉ phục vụ hover/focus/pressed và tắt khi reduced-motion.
- React/native CSS hiện có; typography Be Vietnam Pro tự host qua Fontsource, không gọi font CDN từ browser. Light/dark tokens dùng xuyên suốt màn hình.

## Thay đổi trải nghiệm

- Header thống nhất ở các khu vực, chỉ rõ màn hình đang chọn; đổi màn hình đưa scroll về đầu.
- Trang tài khoản có bố cục gọn, helper text và nút hiện/ẩn mật khẩu; minLength/autocomplete/submit behavior được giữ.
- Nút chính, secondary, loading, empty, lỗi, disabled và keyboard focus có thứ bậc rõ. Loading catalog có skeleton ổn định kích thước.
- Product image giữ trọn hình, lazy load, có kích thước để giảm layout shift và fallback khi URL mẫu/hỏng. Tất cả ảnh demo hiện tại có nhãn minh họa và link nguồn.
- Kho/checkout/cart/order rows responsive; admin form hai cột trên desktop và một cột trên mobile. Hội thoại/ticket/AI dùng chung palette và spacing.
- Theme preference lưu `shopfast:theme`; lấy system preference khi chưa có lựa chọn trước đó.

## Ảnh và font

- [Manifest ảnh local](../apps/web/public/images/products/sources.json), [trang credit](../apps/web/public/images/products/credits.html).
- Tai nghe và micro: ảnh Evan-Amos, public domain. Loa: Pittigrilli, CC BY-SA4.0; credit và license link đi kèm.
- Ảnh dùng minh họa demo, không khẳng định model/nhãn hiệu trong ảnh là sản phẩm đang bán.
- [Font license](../apps/web/public/licenses/be-vietnam-pro-OFL.txt), [Fontsource Be Vietnam Pro](https://fontsource.org/fonts/be-vietnam-pro/install).

## Kiểm tra và evidence

- `npm run check`: format/lint/typecheck,68test và build API/worker/web PASS tại lượt kiểm local.
- `npm run test:e2e`:3test PASS, gồm đăng ký/OTP, password visibility/theme persistence/reduced-motion và luồng browser thực với PostgreSQL: catalog/stock/cart/payment/warehouse/ticket/admin. Lượt CI mới phải xác nhận lại source commit cuối.
- [Contrast sample](evidence/ui-refresh-contrast.json): các nút enabled trang auth đạt tối thiểu5.0:1 sáng và6.69:1 tối; đây là kiểm tra mẫu, không phải chứng nhận toàn bộ WCAG.
- Desktop1440px và mobile390px kiểm tra ảnh load, no overflow và theme; screenshots dưới đây dùng dữ liệu synthetic hoặc public, không chứa mật khẩu/key.

| Màn hình        | Sáng                                           | Tối                                                |
| --------------- | ---------------------------------------------- | -------------------------------------------------- |
| Auth desktop    | [Ảnh](evidence/ui-refresh-auth-desktop.png)    | [Ảnh](evidence/ui-refresh-auth-dark.png)           |
| Auth mobile     | [Ảnh](evidence/ui-refresh-auth-mobile.png)     | Kiểm bằng functional theme test                    |
| Catalog desktop | [Ảnh](evidence/ui-refresh-catalog-desktop.png) | Kiểm bằng token/theme preview                      |
| Catalog mobile  | [Ảnh](evidence/ui-refresh-catalog-mobile.png)  | [Ảnh](evidence/ui-refresh-catalog-dark-mobile.png) |
| Admin desktop   | [Ảnh](evidence/ui-refresh-admin-desktop.png)   | [Ảnh](evidence/ui-refresh-admin-dark.png)          |
| Admin mobile    | [Ảnh](evidence/ui-refresh-admin-mobile.png)    | Cùng responsive tokens                             |

Biên bản toàn bộ harness trước UI refresh thuộc release `edd1fe6`, không gán kết quả hiệu năng cũ cho commit mới. Sau deploy UI, chạy browser/staging smoke đúng release và lưu generated log riêng trong `docs/evidence/`.
