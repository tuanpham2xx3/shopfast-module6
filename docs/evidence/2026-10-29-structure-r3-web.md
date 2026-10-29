# R3 — Frontend theo feature

29/10/2026. `main.tsx` chỉ mount React/BrowserRouter; App, routing và navigation trong `app/`. Auth panel, auth actions và account summary tách khỏi App. Catalog tách types, product media và detail dialog; các màn hình còn lại nhóm theo feature. API client/presentation/styles nằm trong shared. Không đổi route, API hoặc UI labels.

Build web, lint và typecheck PASS. Full browser 19/19 PASS / 1.6 phút với fixture cũ, gồm mobile password/theme, session restore/returnTo, popup/cart pending/focus, role guards, checkout, order operations, realtime offline recovery và dashboard lỗi.

Global CSS trước/sau có cùng Git object hash `30201cbda105fb74151bdda1be31bd926ad5daa1`. Screenshot cùng fixture trước/sau được xem và so sánh byte: cả hai cặp giống hệt nhau tại [auth trước](2026-10-29-ui-clean-auth.png), [auth sau](2026-10-29-structure-auth.png), [store trước](2026-10-29-ui-clean-store.png), [store sau](2026-10-29-structure-store.png). Không dùng screenshot thay kiểm thử hành vi.

Lỗi trong lúc chuyển JSX đã bị compiler phát hiện và sửa trước full browser run; không bỏ assertion hoặc tăng timeout. Runtime browser không cần thư viện UI/router mới.
