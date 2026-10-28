# Review cảnh báo quét image — 28/10/2026

Quét development đầu tiên:648Git blobs,0findings; hai image có2cảnh báo định dạng private key, cùng file `usr/lib/x86_64-linux-gnu/libgnutls.so.30.34.3`. Không có configured-value match. Không mặc định bỏ qua toàn bộ library.

Đã tải source công khai [crypto-selftests-pk.c của GnuTLS3.7.9](https://github.com/gnutls/gnutls/blob/3.7.9/lib/crypto-selftests-pk.c), Git blob `9b7c692a8fc59aba8beeb365b4db75e158ba6a28`; ghép C string và tính SHA256 từng PEM. Các fingerprint match trong binary đều có trong source self-test này. Allowlist lưu fingerprint và đúng đường dẫn library, không chứa private key text. Giá trị secret cấu hình luôn bị kiểm và từ chối trước khi xét exemption định dạng.

Development rerun:648blobs,31archive members của2images,0findings sau review; self-tests PASS. Đây là validation phát triển trên target98b0717, chưa phải receipt sạch cho release cuối. Scanner báo phạm vi cụ thể; không tự tuyên bố không tồn tại mọi loại secret chưa biết. Gate chỉ được đóng bằng lần chạy sạch có artifact và target SHA rõ ràng.
