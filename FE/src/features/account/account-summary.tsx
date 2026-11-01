import { User } from "../../shared/api/client";
import { displayLabel } from "../../shared/presentation/labels";
export function AccountSummary({
  user,
  busy,
  onShop,
  logout,
}: {
  user: User | null;
  busy: boolean;
  onShop: () => void;
  logout: () => Promise<void>;
}) {
  return (
    <div className="account">
      <dl>
        <div>
          <dt>Email</dt>
          <dd>{user?.email}</dd>
        </div>
        <div>
          <dt>Vai trò</dt>
          <dd>{displayLabel(user?.role ?? "")}</dd>
        </div>
        <div>
          <dt>Trạng thái</dt>
          <dd>{user?.verified ? "Đã xác minh" : "Chờ xác minh"}</dd>
        </div>
      </dl>
      <button onClick={onShop}>Khám phá sản phẩm</button>
      <button className="switch" disabled={busy} onClick={logout}>
        Đăng xuất
      </button>
    </div>
  );
}
