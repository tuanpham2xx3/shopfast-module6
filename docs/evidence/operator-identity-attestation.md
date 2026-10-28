# Xác nhận danh tính quản trị — 28/10/2026

Người dùng xác nhận trực tiếp trong phiên làm việc: “Đã bật TOTP và đăng nhập mới có yêu cầu MFA”. Nguồn danh tính theo màn hình đã cung cấp là AWS Builder ID qua IAM Identity Center, home region us-east-1. Đây là xác nhận thao tác của người dùng, không phải API attestation hoặc kiểm chứng rằng mọi phiên tương lai đều bị policy bắt buộc MFA.

API read-only trước đó xác nhận nhóm Identity Center của account ShopFast có một thành viên; role AccountFullAccessRole gắn AdministratorAccess. IAM AccountMFAEnabled=0 và IAM Users/Groups=0 không phản ánh trạng thái MFA của Builder ID. Không tạo IAM user/access key dài hạn để thay thế mô hình này.

CI dùng OIDC role riêng giới hạn release; EC2 dùng instance role với scope backup S3 và SSM. Quyền thao tác hằng ngày của người quản trị vẫn cần phân biệt với full account administration; không coi xác nhận MFA là bằng chứng quyền tối thiểu. Gate tổng identity/least privilege chưa tự chuyển PASS chỉ từ tài liệu này.
