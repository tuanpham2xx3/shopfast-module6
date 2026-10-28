# AWS — Link mở nhanh khi setup và demo

Cập nhật: 28/10/2026. File lưu đường dẫn và thông tin vận hành không bí mật, không chứa mật khẩu, nội dung key hay mã MFA.

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

- [x] Đăng ký MFA Builder ID thành công — người dùng xác nhận và cung cấp ảnh thiết bị TOTP ngày 28/10/2026.
- [ ] Đăng nhập lại và kiểm tra MFA; thiết bị được tin cậy có thể không hỏi lại mã.
- [ ] Xác định dịch vụ/quyền cần advanced features trước khi quyết định nâng cấp.
- [ ] Cấu hình quyền quản trị qua nhóm và các role khi tài khoản hỗ trợ.

Chỉ đánh dấu phần đã có xác nhận. Yêu cầu quyền qua nhóm, least privilege và MFA của SRS vẫn phải được đối chiếu ở bước cấu hình quyền. Trạng thái advanced features chưa được xác minh lại sau khi tạo EC2.

## EC2 đã tạo — thông tin mở lại khi setup/demo

Nguồn: ảnh EC2 Console do người dùng cung cấp ngày 28/10/2026, chưa kiểm tra qua SSH hoặc AWS API.

| Mục | Giá trị |
| --- | --- |
| Name | `rikkei_df` |
| Instance ID | `i-05647e511e0e1780b` |
| Region | Sydney — `ap-southeast-2` |
| Instance type | `m7i-flex.large` |
| State trong ảnh | Running; chưa xác nhận status checks |
| Public IPv4 | `3.27.169.177` |
| Private IPv4 | `172.31.15.211` |
| Public DNS | `ec2-3-27-169-177.ap-southeast-2.compute.amazonaws.com` |
| VPC | `vpc-080d91f9117007ce0` |
| Subnet | `subnet-0dcf7fbfed7481fbf` |
| AMI đã chọn | Canonical Ubuntu 24.04 amd64 — `ami-0c4c0d31978150116` |
| Storage trước Launch | 40 GiB gp3, 3000 IOPS, throughput 125 MiB/s; đã chọn Encrypted trong ảnh |
| KMS key / encryption sau Launch | Chưa xác minh |
| IAM role | Chưa gắn, theo ảnh instance summary |
| IMDSv2 | Required |
| Elastic IP | Chưa gắn |
| Private key local | `.secrets/shopfast-ec2.pem` — tên đường dẫn dự kiến; thay đúng tên file đã tải |

- [Mở instance ở Sydney](https://ap-southeast-2.console.aws.amazon.com/ec2/home?region=ap-southeast-2#InstanceDetails:instanceId=i-05647e511e0e1780b).
- [Security Groups ở Sydney](https://ap-southeast-2.console.aws.amazon.com/ec2/home?region=ap-southeast-2#SecurityGroups:).
- [EBS Volumes ở Sydney](https://ap-southeast-2.console.aws.amazon.com/ec2/home?region=ap-southeast-2#Volumes:).

IP hiện tại được tự cấp, cần kiểm tra lại sau stop/start; không mặc định IP này cố định lâu dài.

### Kết nối từ PowerShell trong thư mục dự án

```powershell
ssh -i ".\.secrets\shopfast-ec2.pem" ubuntu@3.27.169.177
```

Lần đầu kết nối, đối chiếu host fingerprint với thông tin từ EC2 trước khi chấp nhận. Không đưa nội dung `.pem` lên chat, docs hoặc demo; `.secrets/`, `*.pem`, `*.ppk` đã được Git ignore.

Sau khi SSH thành công, kiểm tra máy:

```bash
cat /etc/os-release
free -h
df -h /
```

### Việc tiếp theo

- [ ] Xác nhận EC2 status checks passed.
- [ ] Kiểm tra SSH 22 chỉ cho IP quản trị `/32`. Ảnh trước Launch còn là Anywhere; chưa có evidence đã sửa.
- [ ] Kiểm tra HTTP 80 và HTTPS 443 public; không public 3000/5432/6379.
- [ ] Kiểm tra EBS encryption và KMS key thực tế.
- [x] SSH và xác nhận OS/RAM/dung lượng thực tế — 28/10/2026.
- [x] Cài Docker/Compose trên EC2; không cài Docker Desktop/WSL trên workstation.
- [x] Dựng PostgreSQL16/Redis7, healthcheck đạt, chỉ publish loopback; xem [evidence bootstrap](evidence/ec2-bootstrap-2026-10-28.md).
- [ ] Cấu hình S3 backup và IAM role, rồi domain/HTTPS, CI/CD và restore theo từng bước.

Việc triển khai VPS đang được người dùng hướng dẫn thực hiện từng bước; chưa có bằng chứng ứng dụng đã deploy hoặc nghiệm thu cloud.
