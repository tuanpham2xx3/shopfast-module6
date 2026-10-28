# AWS — Link mở nhanh khi setup và demo

Cập nhật: 28/10/2026. File chỉ lưu đường dẫn, không chứa mật khẩu, key hay mã MFA.

## Dùng ngay: bật MFA cho AWS Builder ID

Tài khoản hiện tại dùng trải nghiệm AWS mới theo project, đăng nhập bằng Builder ID.

| Link | Cách dùng |
| --- | --- |
| [Hồ sơ AWS Builder ID](https://profile.aws.amazon.com/) | **Security → Register device → Authenticator app**. Thêm recovery email nếu được yêu cầu, quét QR bằng ứng dụng rồi chọn Assign MFA. |
| [Hướng dẫn MFA Builder ID chính thức](https://docs.aws.amazon.com/signin/latest/userguide/mfa-builder-id.html) | Mở khi cần xem hướng dẫn hoặc trình bày cách bảo vệ danh tính đăng nhập. |
| [AWS Console](https://console.aws.amazon.com/) | Vào project và các dịch vụ. |
| [AWS Settings](https://settings.aws.com/) | Kiểm tra thiết lập project/tài khoản. |

**Bật MFA cho Builder ID không cần nâng cấp tài khoản.** Không chia sẻ QR, secret cấu hình MFA, OTP hoặc mã khôi phục.

## Chưa thao tác: advanced features và root

Trang **Activate advanced features** hiện yêu cầu nâng cấp. Theo thông báo trên trang người dùng đã mở, việc kích hoạt không thể hoàn tác và xóa spend limits. Chưa kích hoạt chỉ để bật MFA; đánh giá lại khi tới phần quyền/mạng/dịch vụ triển khai.

| Link | Khi nào dùng |
| --- | --- |
| [Security credentials của AWS account](https://console.aws.amazon.com/iam/home#/security_credentials) | Dành cho mô hình tài khoản AWS truyền thống; ở trải nghiệm hiện tại có thể chuyển sang trang yêu cầu advanced features. Không phải đường bật MFA Builder ID. |
| [Root user best practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/root-user-best-practices.html) | Tham khảo khi đã có quyền root của AWS account; MFA Builder ID không đồng nghĩa đã bật MFA root. |
| [IAM security best practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html) | Quyền tối thiểu, MFA và credentials tạm thời; dùng khi cấu hình quyền quản trị, EC2 role và CI/CD. |

## Link cho các phần tiếp theo

Chỉ mở để tra cứu; chưa xác nhận các tính năng này đều khả dụng trên gói/project hiện tại. Console có thể yêu cầu chọn project, region hoặc quyền tương ứng.

| Thành phần | Link console | Mục đích trong ShopFast |
| --- | --- | --- |
| EC2 / EBS | [EC2 Console](https://console.aws.amazon.com/ec2/) | Máy chủ và ổ đĩa; Security Groups cũng có trong EC2. |
| VPC | [VPC Console](https://console.aws.amazon.com/vpc/) | Mạng, subnet và giới hạn truy cập. |
| IAM | [IAM Console](https://console.aws.amazon.com/iam/) | Role cho máy chủ/pipeline và chính sách quyền. |
| S3 | [S3 Console](https://console.aws.amazon.com/s3/) | Phương án lưu backup ngoài EC2. |
| Billing | [Billing Console](https://console.aws.amazon.com/billing/) | Theo dõi chi phí; giao diện/quyền phụ thuộc trải nghiệm tài khoản. |
| Thông số EC2 T3 | [AWS T3](https://aws.amazon.com/ec2/instance-types/t3/) | Tra CPU/RAM khi chọn máy; chưa phải quyết định mua tài nguyên. |

## Ghi nhận tiến độ

- [ ] Đăng ký MFA Builder ID thành công.
- [ ] Đăng nhập lại và kiểm tra MFA; thiết bị được tin cậy có thể không hỏi lại mã.
- [ ] Xác định dịch vụ/quyền cần advanced features trước khi quyết định nâng cấp.
- [ ] Cấu hình quyền quản trị qua nhóm và các role khi tài khoản hỗ trợ.

Chưa đánh dấu hoàn tất vì chưa có xác nhận thao tác thực tế. Yêu cầu quyền qua nhóm, least privilege và MFA của SRS vẫn phải được đối chiếu ở bước cấu hình quyền.
