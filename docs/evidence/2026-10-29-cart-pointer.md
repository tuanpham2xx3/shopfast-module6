# Con trỏ khi cập nhật giỏ hàng

Baseline `b7c72f2cbb11b358ea188b8dea1fa55905e43ca2`, branch `fix/cart-pointer-feedback`.

Nguyên nhân: selector `.cart-dropdown button[aria-disabled="true"]` dùng `cursor: wait`, nên hover trên nút vừa cộng/trừ hiện con trỏ chờ của hệ điều hành trong lúc mutation/refetch. Đổi về pointer; dùng dòng ghi chú có sẵn trong footer làm status “Đang cập nhật giỏ hàng…”, giữ nguyên kích thước panel, focus và chặn mutation lặp. Không đổi quantity transaction hoặc API.

Kiểm tra: `npx playwright test tests/e2e/product-dialog.e2e.spec.ts` **2/2 PASS, 11.1 giây**, desktop1280/mobile390, API fixture. Test giữ GET cart pending sau mutation và xác nhận computed cursor vẫn pointer, status cập nhật hiện, list/footer không unmount; sau response số lượng/tổng và focus vẫn đúng. Lint và production web build PASS.
