# Bảo vệ quyết định kỹ thuật ShopFast

Tài liệu ôn và thực hành ngày **02/11/2026**. Mục tiêu là tự giải thích được hệ thống, mở đúng source và xử lý một tình huống lỗi; không học thuộc câu trả lời để thay cho hiểu biết.

Mốc production gần nhất được dùng khi soạn phần ví dụ là `378b747890f40328d67dd2d5a57c6170967fbbf2`. Các thay đổi sau mốc này phải kiểm tra lại theo commit và pipeline tương ứng. Những số liệu ngày 29/10 được ghi rõ là **lịch sử**, không phải kết quả chạy mới cho tài liệu này.

Đọc cùng [kịch bản 10 phút](10-minute-script.md), [hướng dẫn đọc source](../23-huong-dan-doc-du-an.md), [đặc tả nghiệp vụ](../01-product-spec.md), [quyết định thiết kế](../10-decisions.md) và [kế hoạch hoàn thành SRS](../16-srs-completion-plan.md). Yêu cầu gốc vẫn là tệp SRS ở thư mục gốc; một quyết định DEC bổ sung không tự trở thành yêu cầu nguyên văn của đề.

## 1. Cách trả lời để chứng minh mình hiểu

Một câu trả lời tốt có bốn phần: **bài toán → cơ chế → đánh đổi → cách kiểm chứng/xử lý lỗi**. Ví dụ:

> Tôi dùng transaction PostgreSQL để việc tạo đơn và giữ tồn cùng thành công hoặc cùng thất bại. Nếu chỉ trừ tồn rồi mới tạo đơn, lỗi giữa hai bước có thể làm mất tồn mà không có đơn. Đánh đổi là phải giữ transaction ngắn và xử lý tranh chấp. Tôi mở service tạo đơn và test hai người mua cùng lượng tồn cuối để chứng minh.

Đừng chỉ nói “vì nhanh”, “vì bảo mật”, “chuẩn doanh nghiệp”. Hãy nêu nhanh hơn ở bước nào, bảo vệ dữ liệu gì, và lỗi nào vẫn có thể xảy ra.

## 2. Bảng tiêu chí, thao tác demo và giới hạn minh chứng

| Tiêu chí                     | Chứng minh bằng gì                                                                                          | Mở ở đâu                                                                                                                                                                               | Không suy ra được điều gì                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Chạy thật, HTTPS — 25%       | Mở tên miền, đăng nhập, xem sản phẩm, đặt đơn và mở ticket trong buổi bảo vệ; kiểm tra readiness            | [ShopFast](https://shopfast.tuanpq.com), [runbook](../14-deployment-runbook.md)                                                                                                        | Một lần HTTP 200 không chứng minh ổn định cả buổi hoặc có HA                     |
| Tích hợp ≥5 chủ đề — 25%     | Cùng một đơn đi qua cache, giới hạn tần suất, transaction, queue, socket; ticket dùng Gemini đọc DB         | Các quyết định 3–9 bên dưới, [luồng runtime](../04-runtime-flows.md)                                                                                                                   | Có cài thư viện chưa chứng minh có tích hợp nghiệp vụ                            |
| Triển khai tự động — 20%     | Commit thực → PR checks → merge → build image → deploy → xác nhận SHA; diễn tập nhánh rollback theo runbook | [Actions](https://github.com/tuanpham2xx3/shopfast-module6/actions), [release workflow](../../.github/workflows/release.yml), [script release](../../deploy/release/deploy-release.sh) | Receipt cũ không thay được yêu cầu demo một lần triển khai trực tiếp             |
| Bảo mật, vận hành — 15%      | Kiểm tra role tạm, rule mạng hiện tại, backup S3, restore vào clone, health và cảnh báo                     | [harness](../17-harness-guide.md), [backup](../../deploy/backup/backup.sh), [cloud gate](../16-srs-completion-plan.md)                                                                 | Không được nói đã đạt cổng tối thiểu/MFA/least privilege chỉ từ cấu hình lịch sử |
| Mã nguồn, tài liệu — 15%     | Mở một luồng xuyên layer; xem báo cáo coverage có commit, unit và integration; mở kiến trúc                 | [kiến trúc](../02-data-architecture.md), [cấu trúc](../19-repository-structure.md), [coverage config](../../jest.business.config.js)                                                   | Coverage cao không chứng minh mọi lỗi đã được loại bỏ                            |
| Bảo vệ quyết định — bắt buộc | Tự vẽ lại luồng, giải thích lựa chọn và xử lý sự cố bất ngờ                                                 | Bài tự kiểm cuối tài liệu                                                                                                                                                              | Đọc slide hoặc chỉ đưa link CI chưa đủ                                           |

Sáu chủ đề có thể chỉ rõ ngay: Gemini hỗ trợ ticket; Socket.IO cập nhật đơn riêng tư; Redis rate limit chống lạm dụng; Redis cache catalog; BullMQ xử lý tác vụ nền; PostgreSQL transaction/giữ tồn. CI/CD, backup và health là phần vận hành bổ sung. Không cần tách thành sáu ứng dụng để được tính là tích hợp thực chất.

## 3. Vì sao dùng Modular Monolith và chia BE/FE?

**Câu trả lời ngắn:** “Backend là Modular Monolith: chia theo nghiệp vụ nhưng dùng chung một codebase và database; bên trong module chia layer. Frontend React nằm riêng trong `FE` để dễ chạy, build và tìm code giao diện.”

- **Cơ chế:** `BE/modules` chứa auth, catalog, orders, tickets, AI, jobs; HTTP nhận/validate yêu cầu, application xử lý use case, persistence truy cập dữ liệu, adapters nối dịch vụ ngoài, composition lắp dependency. `BE/platform` cung cấp phần dùng chung. Xem [cây thư mục](../19-repository-structure.md).
- **Vì sao:** nghiệp vụ đơn hàng–tồn kho cần transaction chặt; một dự án và một nhóm nhỏ chưa cần gánh network contract, phân tán dữ liệu và nhiều pipeline như microservices.
- **Phương án khác:** tách microservices có thể scale/deploy từng dịch vụ độc lập, nhưng giao dịch liên dịch vụ và vận hành phức tạp hơn. Một thư mục service khổng lồ thì ban đầu đơn giản nhưng khó giữ ranh giới nghiệp vụ.
- **Khi lỗi:** xác định request đi qua controller → service → repository thay vì sửa ngẫu nhiên ở UI. Chạy `npm run architecture:check` để phát hiện một số vi phạm cấu trúc/import.
- **Mở minh chứng:** [order service](../../BE/modules/orders/src/application/order.service.ts), [kiểm tra kiến trúc](../../tools/scripts/check-architecture.mjs).
- **Không tuyên bố:** mọi dependency đã đảo chiều hoàn hảo, đây là microservices, hoặc tên folder tự chứng minh Clean Architecture. Đánh giá phải dựa vào hướng phụ thuộc và trách nhiệm thực tế.

## 4. Vì sao API và worker chạy hai tiến trình?

**Câu trả lời ngắn:** “Khách cần nhận kết quả đặt đơn nhanh; gửi mail, tạo hóa đơn và đồng bộ đối tác chạy nền để không giữ request chờ dịch vụ ngoài.”

- **Cơ chế:** [API](../../BE/api/src/main.ts) nhận HTTP/socket; [worker](../../BE/worker/src/main.ts) xử lý queue và lịch. Hai tiến trình dùng cùng module backend, không phải hai microservice độc lập.
- **Đánh đổi:** trả đơn thành công không có nghĩa email đã gửi ngay. Cần lưu trạng thái công việc, retry và cho người vận hành xem lỗi.
- **Phương án khác:** gọi Resend ngay trong transaction dễ hiểu nhưng nhà cung cấp chậm có thể giữ khóa DB và làm checkout lỗi dù dữ liệu đặt hàng hợp lệ.
- **Khi worker chết:** API vẫn có thể nhận các nghiệp vụ được hỗ trợ; outbox/job còn bền trong DB/queue được xử lý khi worker trở lại. Không tự hứa mọi tác vụ vẫn chạy đúng giờ khi worker ngừng.
- **Kiểm chứng:** [jobs service](../../BE/modules/jobs/src/application/jobs.service.ts), [jobs integration](../../BE/tests/integration/jobs.integration.spec.ts), [evidence diễn tập](../evidence/2026-10-29-structure-production.md).

## 5. Transaction, reservation, version và idempotency khác nhau thế nào?

**Câu trả lời ngắn:** “Transaction bảo vệ các thay đổi liên quan; reservation giữ hàng cho đơn; version phát hiện dữ liệu cũ; idempotency chống tạo thêm tác dụng khi request bị gửi lại. Bốn cơ chế giải quyết bốn vấn đề khác nhau.”

Luồng cần tự giải thích: server xác thực khách → đọc giỏ và giá thật → kiểm tra/giữ tồn trong transaction → tạo đơn và bản ghi liên quan → commit → xử lý tác vụ sau commit. UI và cache không quyết định còn hàng hay tổng tiền cuối cùng.

- **Tranh chấp:** hai khách mua lượng hàng cuối không được cùng thành công nếu tổng vượt tồn. Khóa/điều kiện cập nhật và constraint DB là hàng rào cuối; chỉ vô hiệu nút bấm ở frontend không đủ.
- **Reservation:** tạm giữ lượng có thể bán; hết hạn hoặc hủy phải giải phóng theo state transition hợp lệ. Phân biệt tồn vật lý với lượng còn có thể bán.
- **Version:** client cập nhật dựa trên bản cũ phải nhận conflict/resync; không được ghi đè im lặng. Version là kỹ thuật đồng thời, không phải thông tin cần nhét vào câu trả lời khách hàng.
- **Idempotency:** cùng key và cùng nội dung cho cùng actor trả kết quả đã có; key cũ với nội dung khác phải bị từ chối. Nếu mạng mất sau khi DB commit, retry không được tạo đơn thứ hai.
- **Phương án khác:** chỉ dựa vào Redis lock không thay thế transaction DB; khóa có thể hết TTL, Redis có thể mất kết nối. Retry HTTP không có idempotency có thể nhân đôi đơn.
- **Mở và demo:** [order service](../../BE/modules/orders/src/application/order.service.ts), [test transaction/race](../../BE/tests/integration/orders.integration.spec.ts). Gửi lại checkout đúng cùng key; so order ID và kiểm tra tồn không bị trừ thêm.
- **Không tuyên bố:** idempotency bảo đảm mọi hệ thống bên ngoài “exactly once” vô điều kiện. Phải xét riêng cách bên nhận nhận diện một tác dụng đã thực hiện.

## 6. Vì sao cần outbox dù đã có BullMQ?

**Câu trả lời ngắn:** “Queue không nằm trong transaction PostgreSQL. Outbox ghi ý định gửi tác vụ cùng transaction nghiệp vụ, tránh tạo đơn xong nhưng mất luôn công việc gửi mail do tiến trình chết.”

- **Cơ chế:** transaction ghi nghiệp vụ và outbox → dispatcher đưa vào queue → consumer thực hiện. Có thể phát lại; job ID/dedup và kiểm tra trạng thái tác dụng phải khiến lần xử lý lại an toàn.
- **Phương án khác:** gọi `queue.add` sau commit có khe hở crash; gọi trước commit có thể chạy việc cho một đơn sau đó rollback. Outbox đổi vấn đề “mất việc” thành “có thể lặp việc và phải xử lý lặp an toàn”.
- **Khi lỗi:** retry có backoff cho lỗi tạm thời; vượt số lần chuyển trạng thái thất bại/dead-letter để điều tra và replay có kiểm soát. Không retry vô hạn lỗi dữ liệu hoặc gửi lại email thủ công mà chưa kiểm tra receipt.
- **Mở minh chứng:** [outbox](../../BE/platform/src/outbox/outbox.ts), [jobs repository](../../BE/modules/jobs/src/persistence/jobs.repository.ts), [outbox integration](../../BE/tests/integration/outbox.integration.spec.ts), [jobs integration](../../BE/tests/integration/jobs.integration.spec.ts).
- **Giới hạn:** đối tác đồng bộ tồn là **đối tác demo** đã được chọn cho đồ án; không tuyên bố đã kết nối ERP/đối tác thương mại thật. Test crash dùng sink mô phỏng chứng minh cơ chế tương ứng, không chứng minh Resend không bao giờ gửi lặp.

## 7. Cache Redis: nhanh nhưng có được tin là dữ liệu thật không?

**Câu trả lời ngắn:** “Cache phục vụ đọc catalog; PostgreSQL là nguồn đúng cho checkout và tồn kho. Khi sửa dữ liệu phải vô hiệu cache liên quan, không chờ TTL rồi mới đúng.”

- **Cơ chế hiện tại:** [catalog cache](../../BE/modules/runtime/src/catalog-cache.ts) dùng key theo truy vấn, tag/generation và kiểm tra generation khi ghi; lock ngắn giảm nhiều request cùng nạp một key. Tag truy vấn còn bao phủ thay đổi thành viên danh sách, kể cả kết quả rỗng.
- **Tình huống khó:** request A đọc DB cũ, request B đổi giá và invalidation, rồi A mới ghi cache. Kiểm tra generation ngăn A đưa dữ liệu cũ trở lại. TTL một mình không xử lý được cuộc đua này.
- **Khi Redis/invalidation lỗi:** có đường đọc DB và cơ chế bypass/retry invalidation. API vẫn phải áp dụng rule DB ở checkout. Bypass trong bộ nhớ một tiến trình không tự là control plane chia sẻ cho nhiều API; scale ngang cần kiểm tra lại thiết kế.
- **Phương án khác:** cache toàn bộ endpoint mà không chuẩn hóa filter dễ trả sai trang; quét `KEYS` hoặc xóa cả Redis ảnh hưởng queue/limiter và gây tải nạp lại. Cache là tối ưu có chi phí tính đúng, không phải thay database.
- **Demo/test:** tải lại cùng filter rồi đổi giá/tồn; kết quả sau sửa phải đúng. [Cache thật Redis](../../BE/tests/integration/cache-redis.integration.spec.ts), [runtime cache](../../BE/tests/runtime/cache.spec.ts), [invalidation](../../BE/modules/runtime/src/catalog-invalidation.ts).
- **Không tuyên bố:** mọi request đều dưới 20 ms, hit rate luôn ≥80%, hoặc p95 đạt chỉ vì một lần đọc nhanh. Muốn kết luận phải có workload, thời gian, môi trường và receipt đo.

## 8. Rate limit giải quyết gì ngoài “chặn spam”?

**Câu trả lời ngắn:** “Giới hạn theo user hoặc IP giúp giữ tài nguyên dùng chung; các điểm nhạy cảm như đăng nhập có mức chặt hơn. Chống đoán mật khẩu còn cần xét tài khoản đích, vì kẻ tấn công có thể đổi IP.”

- **Cơ chế:** [limiter](../../BE/modules/runtime/src/limiter.ts) và [interceptor](../../BE/modules/runtime/src/http/runtime.interceptor.ts) áp chính sách ở server; trả 429, thời gian thử lại và thông báo phù hợp. Không chỉ disable nút ở browser.
- **Đánh đổi:** cùng IP có thể là nhiều người trong mạng trường; chỉ giới hạn IP sẽ gây oan. Chỉ giới hạn user thì endpoint chưa login lại không có user. Cần kết hợp theo loại hành động.
- **Khi Redis lỗi:** xem rõ chính sách từng route và test thay vì nói mặc định “tất cả fail-open” hoặc “tất cả fail-closed”. Route nhạy cảm phải được đánh giá theo rủi ro bảo mật, không chỉ sự sẵn sàng.
- **Kiểm chứng:** [limiter integration](../../BE/tests/runtime/limiter.integration.spec.ts), [auth integration](../../BE/tests/integration/auth.integration.spec.ts). Dùng test/tài khoản demo cho bài thử, tránh khóa nhầm tài khoản bảo vệ.
- **Giới hạn:** rate limit ứng dụng không thay WAF, chống DDoS ở hạ tầng hoặc chống mọi kiểu chiếm tài khoản.

## 9. Socket.IO: tại sao không broadcast tất cả đơn?

**Câu trả lời ngắn:** “Socket phải kiểm tra đăng nhập và quyền sở hữu như HTTP. Khách chỉ được subscribe đơn của mình; client không tự chọn một room tùy ý để nghe dữ liệu người khác.”

- **Cơ chế:** [gateway](../../BE/modules/realtime/src/adapters/realtime.gateway.ts) xác thực handshake, kiểm tra quyền trước khi vào room; event mang định danh/version để bỏ lặp và nhận ra thiếu cập nhật. Event sau commit mới đại diện dữ liệu đã ghi.
- **Reconnect:** mất kết nối không đồng nghĩa không có đơn mới. Client subscribe lại, lấy snapshot qua REST và đối chiếu version; sự kiện không thay nguồn dữ liệu bền. Khi realtime không hoạt động, đường đọc thông thường vẫn cần dùng được.
- **Phương án khác:** polling đơn giản nhưng lặp request và có độ trễ; socket nhanh hơn nhưng cần xử lý reconnect, session hết hạn và ownership. Chỉ giấu order ID ở UI không bảo vệ socket.
- **Khi lỗi:** kiểm tra session → subscribe ack → room quyền sở hữu → event/outbox → resync. Không sửa bằng cách broadcast chung để “cho thấy có cập nhật”.
- **Demo/test:** hai browser/tài khoản khác nhau, cập nhật đơn A, tài khoản B không nhận được dữ liệu. Ngắt mạng A rồi nối lại và kiểm tra snapshot. [Realtime integration](../../BE/tests/integration/realtime.integration.spec.ts).
- **Không tuyên bố:** socket cung cấp exactly-once hoặc không bao giờ mất gói; SLA <1 giây cần đo trong điều kiện nêu rõ.

## 10. Gemini làm gì, và ai chịu trách nhiệm dữ liệu?

**Câu trả lời ngắn:** “Gemini hiểu ý định và chọn tool; backend kiểm quyền, đọc dữ liệu thật và dựng câu trả lời nghiệp vụ. AI không tự truy vấn SQL tùy ý và không được tự xác nhận thay đổi ticket.”

- **Cơ chế:** Google AI Studio API ở backend, model `gemini-3.1-flash-lite`; [provider](../../BE/modules/ai/src/adapters/gemini.provider.ts) chọn tool, [AI service](../../BE/modules/ai/src/application/ai.service.ts) thực thi theo policy. Hai tool đọc thật là tra đơn và kiểm tồn. Tra đơn còn ràng buộc chủ ticket/đơn liên kết.
- **Tại sao tool-first:** sau tool đọc thành công, server trả câu tiếng Việt từ kết quả DB; không gọi thêm một vòng model chỉ để viết lại dữ liệu đã biết. Giảm độ trễ và tránh lỗi JSON cuối làm hỏng kết quả đọc đúng. Không có nghĩa model đã bị thay bằng dữ liệu giả.
- **AI ghi dữ liệu:** đề xuất nhãn là proposal, chưa phải mutation. Người có quyền phải xác nhận; backend kiểm actor, hạn, version và trạng thái proposal. Cùng nhãn thì không cần tạo đổi nhãn giả; xác nhận lặp không ghi lần hai.
- **Câu hỏi mơ hồ:** “hỗ trợ tôi” cần hỏi thêm; không có SKU/order thì không bịa. Ngoài phạm vi thì từ chối lịch sự. Nội dung ticket là dữ liệu đầu vào, không phải chỉ dẫn được phép vượt policy.
- **Khi Gemini 429/503/timeout:** có giới hạn thời gian/thử lại; giao diện báo phù hợp và nhân viên vẫn tra cứu, trả lời, cập nhật theo quyền thông thường. Không gọi liên tục để thử vận may hoặc coi API key thứ hai là quota chắc chắn độc lập nếu chưa đo.
- **Phương án khác:** để model tự viết mọi câu dễ linh hoạt nhưng phải kiểm chứng format và tính đúng; cho AI tự ghi DB giảm thao tác nhưng vi phạm human confirmation và tăng rủi ro.
- **Demo/test:** tra đơn hợp lệ → đối chiếu dữ liệu; SKU không tồn tại; câu mơ hồ; ngoài phạm vi; đề xuất nhãn rồi xác nhận và thử xác nhận lại. [Tickets/AI integration](../../BE/tests/integration/tickets-ai.integration.spec.ts), [tool-first production 02/11](../evidence/2026-11-02-ai-tool-first-production.md), [câu trả lời tiếng Việt](../evidence/2026-11-02-ai-vietnamese-production.md).
- **Không tuyên bố:** Gemini luôn sẵn sàng, không hallucinate trong mọi hoàn cảnh, hoặc một lời trả lời tự tin tự nó là bằng chứng. Cần mở tool evidence và quyền truy cập tương ứng.

## 11. Vì sao local native, VPS dùng Docker; vì sao EC2 thay RDS?

**Câu trả lời ngắn:** “Máy phát triển chạy PostgreSQL/Memurai native để không chịu tải WSL/Docker Desktop; VPS/CI dùng container để cố định môi trường triển khai. Hiện gom trên EC2 để giảm độ phức tạp và chi phí của đồ án.”

- **Cơ chế:** lệnh dev chạy API, worker, web riêng; VPS dùng image build từ commit và network riêng cho DB/Redis. [README](../../README.md), [deploy](../../deploy/release/deploy-release.sh).
- **Đánh đổi native:** dễ chạy trên máy hiện có nhưng Windows và Linux có khác biệt; cần integration test với phụ thuộc thật và build Linux trong CI. Memurai tương thích API Redis không đồng nghĩa mọi hành vi mọi phiên bản Redis đều giống hệt.
- **Đánh đổi EC2:** tự quản cập nhật, DB, backup, tài nguyên và khôi phục. RDS giảm một phần việc quản DB và có lựa chọn HA nhưng tăng chi phí/phạm vi. Chưa chọn RDS không có nghĩa RDS kém hơn.
- **Khi host mất:** API, worker, DB/Redis cùng host có thể cùng mất; phải dựng lại và restore backup ngoài host. Restart container không giải quyết mất ổ đĩa/instance.
- **Không tuyên bố:** hệ thống hiện có multi-AZ, HA, zero downtime trước mọi lỗi hoặc credits là bảo đảm không phát sinh hóa đơn. Budget/credit không tự tạo trần chi tiêu cứng cho mọi dịch vụ.

## 12. Nginx, HTTPS, Cloudflare và “không có khóa dài hạn”

**Câu trả lời ngắn:** “Tên miền giải quyết tìm đúng dịch vụ; HTTPS bảo vệ đường truyền; Nginx phục vụ frontend và chuyển API/socket. Quyền AWS cho pipeline dùng OIDC/STS thay access key AWS lưu lâu dài.”

- **Cloudflare/DNS:** DNS nối subdomain tới dịch vụ; DNS và reverse proxy/TLS là các lớp khác nhau. Không được nói Cloudflare đang che origin/WAF nếu chưa kiểm tra record có proxy và cấu hình hiện hành. [Nginx config](../../deploy/nginx/nginx.conf).
- **AWS CI:** GitHub phát token OIDC theo job → AWS kiểm trust policy → STS cấp quyền tạm; job deploy dùng SSM, không phải SSH PEM đặt trong GitHub secret. EC2 dùng instance role cho việc được cấp. [Workflow](../../.github/workflows/release.yml).
- **Phân biệt secret:** cơ chế trên loại bỏ nhu cầu **AWS access key dài hạn của application/pipeline**; Gemini/Resend vẫn có provider API key, và quản trị thủ công có thể có SSH private key. Những secret đó cần giữ ngoài Git, hạn quyền file, hạn quyền sử dụng và xoay khi lộ. Không nói “dự án không có bất kỳ secret dài hạn nào”.
- **Mạng tối thiểu:** HTTP/HTTPS dành cho web; SSH nếu còn dùng phải giới hạn IP quản trị; PG/Redis không public. Đợt troubleshooting đã có thay đổi SSH source: phải audit **Security Group đang gắn instance hiện tại**, không lấy ảnh/check cũ để kết luận đạt.
- **MFA và quyền người:** Builder ID MFA, Identity Center và IAM root MFA là các phạm vi khác nhau. `AccountMFAEnabled=0` trong IAM summary không đủ kết luận Builder ID chưa có TOTP; ngược lại lời xác nhận bật TOTP cũng không chứng minh mọi role/group đã least privilege. Cổng này cần evidence đúng nguồn danh tính/quyền hiện hành.
- **Khi lỗi/bị lộ:** thu hồi/xoay đúng loại credential, xem quyền đã cấp và nhật ký; không chỉ xóa dòng khỏi Git vì lịch sử hoặc token đã bị sao chép vẫn tồn tại.
- **Không tuyên bố:** toàn bộ tiêu chí bảo mật đã PASS. [Kế hoạch SRS](../16-srs-completion-plan.md) và cloud audit mới là nơi theo dõi các gate còn thiếu.

## 13. CI/CD triển khai đúng commit và quay lui thế nào?

**Câu trả lời ngắn:** “PR phải qua kiểm thử; merge tạo image theo SHA. Deploy kéo đúng image, kiểm tra candidate rồi mới đổi tuyến; lỗi health/promotion thì phục hồi tuyến và frontend trước đó.”

- **Cơ chế thật:** [release workflow](../../.github/workflows/release.yml) build app/web, push GHCR theo SHA; deploy dùng role tạm gửi SSM command. [Release script](../../deploy/release/deploy-release.sh) khóa concurrent release, kiểm tra SHA 40 ký tự, lấy digest, chạy API candidate riêng, readiness, migration bằng identity riêng rồi đổi Nginx/frontend symlink.
- **Kiểm tra sau đổi:** readiness HTTPS và frontend asset JavaScript phải hợp lệ; worker đổi sau API. Có lưu release receipt/previous và giữ container cũ để phục hồi. Không chỉ thấy container Running là coi deploy thành công.
- **Đánh đổi:** candidate trên cùng EC2 giảm gián đoạn ứng dụng nhưng vẫn chung tài nguyên/DB; không phải blue-green hai hạ tầng hoàn toàn độc lập. Migration phải tương thích bản cũ; quay lui image **không tự hoàn tác schema/dữ liệu**.
- **Khi lỗi:** candidate không ready thì giữ tuyến cũ; lỗi sau promotion gọi rollback tuyến/symlink. Nếu migration phá tương thích, rollback image có thể không cứu được: phải có kế hoạch migration an toàn và phục hồi phù hợp.
- **Gate test đỏ:** [receipt CI bị chặn](../evidence/ci-rejection-proof.md) là PR thử nghiệm lỗi có chủ đích, không merge. Nó chứng minh một gate đã chặn ở thời điểm đó; không thay demo commit mới chạy trực tiếp.
- **Giới hạn số đo:** mục tiêu deploy <10 phút và rollback <2 phút cần receipt đo cho lần diễn tập cụ thể. Promotion 19 giây trong [receipt 02/11](../evidence/2026-11-02-ai-tool-first-production.md) không phải toàn bộ thời gian từ commit, chờ runner, build tới deploy.

### Thực hành demo triển khai trước buổi bảo vệ

1. Chuẩn bị thay đổi nhỏ có ý nghĩa, an toàn và dễ nhận ra; không bypass branch protection. Ghi SHA ban đầu và cách quan sát release đang chạy.
2. Bắt đầu đồng hồ khi tạo commit/push, mở PR và Actions để người xem theo dõi kiểm thử thực. Có thể pipeline chạy trong lúc trình bày kiến trúc; không hứa nó chắc hoàn tất trong thời lượng nếu chưa diễn tập.
3. Chỉ merge khi checks bắt buộc đạt. Theo dõi build image và deploy; so merged SHA, receipt, phiên bản ứng dụng và thao tác người dùng sau deploy.
4. Diễn tập rollback theo [runbook](../14-deployment-runbook.md)/harness trên môi trường được phép. Không cố tình làm hỏng dữ liệu production chỉ để có màn demo rollback.
5. Lưu thời gian, SHA, run URL, kết quả health và continuity. Nếu không hoàn tất live, nói rõ phần nào chỉ có receipt lịch sử; không gọi đó là đạt trọn yêu cầu demo trực tiếp.

## 14. Backup, restore, health và coverage chứng minh điều gì?

**Câu trả lời ngắn:** “Backup chỉ có giá trị khi phục hồi và kiểm tra dữ liệu được; health phải phân biệt tiến trình còn sống với phụ thuộc có dùng được; coverage đo phần code đã chạy qua test, không đo trực tiếp tính đúng của sản phẩm.”

- **Backup:** [script backup](../../deploy/backup/backup.sh) tạo bản PostgreSQL và chuyển ra S3 ngoài host. [Restore rehearsal](../../deploy/backup/restore-rehearsal.sh) phục hồi vào môi trường clone để kiểm tra thay vì ghi đè production. Cần xem timestamp, checksum, quyền bucket và khả năng giải mã/đọc bản sao.
- **RPO/RTO:** backup hằng ngày có thể mất phần dữ liệu phát sinh sau bản gần nhất; không tự có RPO=0. Thời gian restore clone không gồm mặc định thời gian phát hiện, dựng host mới, DNS và xác nhận nghiệp vụ sau thảm họa.
- **Health/monitoring:** [dependency probes](../../BE/platform/src/health/dependency-probes.ts), [readiness](../../BE/platform/src/health/readiness.ts) cho biết phụ thuộc tại thời điểm kiểm tra. Endpoint health không tự là cảnh báo chủ động; cần kiểm tra collector/alarm có chạy và ai nhận cảnh báo. Đọc queue age/failure, disk, RAM và backup freshness để thấy sự cố trước khi khách báo.
- **Coverage:** [unit config](../../jest.unit-business.config.js) và [combined config](../../jest.business.config.js) đặt ngưỡng **line coverage 60%** trong phạm vi business modules. Unit chỉ chạy độc lập; combined có unit/integration trên phụ thuộc thật. Không dùng combined để giả là unit coverage.
- **Số liệu có nguồn:** [receipt 29/10](../evidence/2026-10-29-structure-production.md), mốc `ffcb599`, ghi unit line **60,54%**, combined **87,05%**. Đây là số lịch sử, không phải số vừa đo ở commit production mới nhất. Cần mở artifact CI đúng SHA hoặc chạy `npm run test:unit:coverage` và `npm run test:coverage` với DB/Redis test đã chuẩn bị để có số mới.
- **Giới hạn:** có unit/integration/browser PASS không chứng minh toàn bộ SRS PASS; còn cần hiệu năng, nhà cung cấp thật, quyền cloud, restore và demo triển khai. Test scheduler dùng clock điều khiển chứng minh logic lịch, không chứng minh worker thực tế đã chạy suốt đêm.

## 15. Câu hỏi sự cố: nên kiểm tra và phục hồi gì trước?

| Tình huống giảng viên đưa ra                   | Trình tự giải thích hợp lý                                                                                                 | Câu trả lời cần tránh                       |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Bấm đặt hàng, mạng mất, không biết có đơn chưa | Giữ idempotency key, đọc/retry theo contract, so order đã ghi; không tạo key mới vô điều kiện                              | “Bấm lại đến khi được”                      |
| Hai người mua món cuối                         | DB transaction/điều kiện tồn quyết định; một bên có thể nhận lỗi hết hàng; kiểm tra test race                              | “Frontend khóa nút rồi”                     |
| Đổi giá mà danh sách còn giá cũ                | So DB, filter/key/tag, generation và invalidation/outbox; không dùng giá cache để checkout                                 | “Chờ TTL là đúng SRS”                       |
| Redis ngừng                                    | Xác định cache/limiter/queue/socket bị ảnh hưởng riêng; theo policy route và kiểm tra DB; phục hồi Redis rồi xử lý backlog | “Redis chỉ là cache nên không ảnh hưởng gì” |
| Worker chết sau khi gửi email                  | Kiểm tra job/effect receipt và dedup trước replay; phân biệt provider nhận mail với DB đánh dấu hoàn thành                 | “Retry chắc chắn không lặp”                 |
| Socket ngắt vài phút                           | Xác thực lại, subscribe đúng quyền, đọc snapshot và so version                                                             | “Socket tự nhớ mọi event”                   |
| Gemini trả 429/503                             | Xem quota/timeout, tránh thử dồn, giữ thao tác hỗ trợ thủ công; dữ liệu đơn không phụ thuộc model                          | “Đổi key là hết mọi lỗi”                    |
| Candidate deploy lỗi                           | Giữ/phục hồi tuyến cũ, kiểm tra readiness/log và schema tương thích; đo rollback                                           | “Build thành công thì deploy chắc chạy”     |
| EC2 mất hoàn toàn                              | Dựng lại dịch vụ từ source/image và cấu hình, lấy backup S3, restore và xác minh; đánh giá dữ liệu sau backup bị mất       | “Docker restart là đủ”                      |
| Tài khoản khách đọc đơn người khác             | Kiểm tra quyền server ở HTTP, socket và AI tool; thêm test actor khác, không chỉ ẩn UI                                     | “Không biết URL là an toàn”                 |

## 16. Tự kiểm trước khi lên bảo vệ

Không nhìn tài liệu trong lượt đầu. Mỗi bài cần tự giải thích, mở source và chỉ ra test/receipt; chỉ kể tên công nghệ chưa đạt.

1. Vẽ luồng một checkout từ browser tới DB, outbox, worker, socket. Chỉ đúng thời điểm commit và giải thích nếu tiến trình chết ở hai phía của commit.
2. Phân biệt transaction, reservation, version và idempotency bằng bốn ví dụ lỗi khác nhau. Nêu vì sao một cơ chế không thay cả ba cơ chế còn lại.
3. Mở một module BE và đi theo request qua các layer. Nếu chuyển controller sang folder khác nhưng vẫn chứa toàn bộ nghiệp vụ, giải thích vì sao chưa gọi là tách trách nhiệm.
4. Tự dựng cuộc đua cache “đọc cũ → invalidate → ghi cũ” và chỉ ra generation chặn ở đâu. Nếu thêm API replica, nêu phần nào cần kiểm tra lại.
5. Thử mô tả cách khách B tìm cách nghe socket/tra tool đơn khách A; chỉ ra từng lần backend kiểm quyền.
6. Hỏi Gemini một câu thiếu dữ kiện, một câu đọc DB và một đề nghị đổi nhãn. Giải thích kết quả nào là model chọn, kết quả nào là backend quyết định và lúc nào DB thực sự bị ghi.
7. Theo một SHA qua PR, Actions, GHCR và release receipt. Giải thích vì sao cùng tên tag chưa mạnh bằng digest và vì sao migration ảnh hưởng rollback.
8. Phân loại AWS STS credential, GitHub token theo job, provider API key và SSH PEM. Nói loại nào còn dài hạn và cách thu hồi; không mở giá trị secret để minh họa.
9. Mở Security Group hiện tại và nguồn danh tính đúng. Nếu chưa có quyền/phiên audit, nói chưa kiểm chứng thay vì điền PASS từ trí nhớ.
10. Đọc một báo cáo coverage, nêu SHA/phạm vi/unit hay combined; đọc một receipt restore và nêu điều nó chưa đo. Tự ước lượng phần dữ liệu có thể mất giữa hai backup.

Nếu không giải thích được câu nào, quay về source và tự chạy case tương ứng. Mục tiêu của lần ôn cuối là có thể xử lý câu hỏi đổi điều kiện (“nếu thêm một server?”, “nếu timeout sau commit?”), không phải lặp nguyên văn tài liệu này.

## 17. Trạng thái minh chứng và những điều phải xác minh lại

- **Có source và test để giải thích:** kiến trúc module/layer, transaction/idempotency, cache, limiter, queue/outbox, ownership socket và Gemini tool/human confirmation. Link source không tự là kết quả chạy mới.
- **Có receipt lịch sử:** [CI chặn test đỏ](../evidence/ci-rejection-proof.md), [nghiệm thu/restore/resilience 29/10](../evidence/2026-10-29-structure-production.md), [Gemini thật 02/11](../evidence/2026-11-02-ai-tool-first-production.md), [Vietnamese answer production](../evidence/2026-11-02-ai-vietnamese-production.md). Luôn đọc SHA, ngày, phạm vi thật/mô phỏng và giới hạn trong từng receipt.
- **Cần kiểm tra hiện hành:** SG/SSH source, quyền cloud qua nhóm và MFA đúng identity source; backup/alarm còn hoạt động; coverage theo SHA cuối; health và nghiệp vụ sau thay đổi cuối.
- **Cần diễn tập trực tiếp:** commit → checks → deploy có đồng hồ, rollback và continuity theo môi trường được phép. Lưu receipt mới, không đổi nhãn receipt cũ thành live demo.
- **Giới hạn đã chấp nhận về phạm vi:** đối tác tồn kho demo; EC2 đơn không HA; provider AI/mail có thể lỗi ngoài quyền kiểm soát. Các giới hạn này cần nói thẳng và giải thích đường khôi phục/thao tác thay thế.

Tài liệu này không tự cấp chứng nhận “all SRS PASS”. Kết luận nghiệm thu cần ghép code đúng SHA, kiểm thử đã chạy, minh chứng vận hành hiện tại và phần giải thích trực tiếp của người trình bày.
