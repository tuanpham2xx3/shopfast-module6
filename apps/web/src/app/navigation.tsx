import { Dispatch, SetStateAction } from "react";
import { User } from "../shared/api/client";
import { Screen } from "./routing";
import { CartDropdown } from "../features/cart/cart-dropdown";
interface Props {
  screen: Screen;
  setScreen: (screen: Screen) => void;
  user: User | null;
  accessToken: string;
  canShop: boolean;
  cartCount: number | null;
  cartRevision: number;
  setCartRevision: Dispatch<SetStateAction<number>>;
  theme: "light" | "dark";
  setTheme: Dispatch<SetStateAction<"light" | "dark">>;
  onCartLogin: () => void;
}
export function Navigation({
  screen,
  setScreen,
  user,
  accessToken,
  canShop,
  cartCount,
  cartRevision,
  setCartRevision,
  theme,
  setTheme,
  onCartLogin,
}: Props) {
  return (
    <nav className="topnav" aria-label="Điều hướng chính">
      <div className="brand">
        <span className="brand-symbol" aria-hidden="true">
          SF
        </span>
        <strong>ShopFast</strong>
      </div>
      <div className="nav-actions">
        <button
          aria-current={screen === "catalog" ? "page" : undefined}
          onClick={() => setScreen("catalog")}
        >
          Cửa hàng
        </button>
        {user?.verified && (
          <button
            aria-current={screen === "tickets" ? "page" : undefined}
            onClick={() => setScreen("tickets")}
          >
            Hỗ trợ
          </button>
        )}
        {user?.verified &&
          ["CUSTOMER", "WAREHOUSE", "ADMIN"].includes(user.role) && (
            <button
              aria-current={screen === "orders" ? "page" : undefined}
              onClick={() => setScreen("orders")}
            >
              Đơn hàng
            </button>
          )}
        {user?.verified && ["WAREHOUSE", "ADMIN"].includes(user.role) && (
          <button
            aria-current={screen === "inventory" ? "page" : undefined}
            onClick={() => setScreen("inventory")}
          >
            Kho
          </button>
        )}
        {user?.verified && user.role === "ADMIN" && (
          <button
            aria-current={screen === "admin" ? "page" : undefined}
            onClick={() => setScreen("admin")}
          >
            Quản trị
          </button>
        )}
        <button
          aria-current={screen === "auth" ? "page" : undefined}
          aria-label="Tài khoản"
          onClick={() => setScreen("auth")}
        >
          {user ? "Tài khoản" : "Đăng nhập"}
        </button>
        {(!user || user.role === "CUSTOMER") && (
          <CartDropdown
            key={user?.id ?? "guest"}
            token={accessToken}
            canShop={canShop}
            count={cartCount}
            revision={cartRevision}
            onChange={() => setCartRevision((value) => value + 1)}
            onCheckout={() => setScreen("cart")}
            onLogin={onCartLogin}
          />
        )}
      </div>
      <button
        className="theme-toggle"
        onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        aria-label={
          theme === "light"
            ? "Chuyển sang giao diện tối"
            : "Chuyển sang giao diện sáng"
        }
      >
        <svg
          aria-hidden="true"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {theme === "light" ? (
            <path d="M20.8 13a9 9 0 0 1-9.8-9.8A9 9 0 1 0 20.8 13Z" />
          ) : (
            <>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
            </>
          )}
        </svg>
      </button>
    </nav>
  );
}
