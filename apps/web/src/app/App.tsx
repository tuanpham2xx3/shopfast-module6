import React, { useEffect, useState } from "react";
import { Catalog } from "../features/catalog/catalog";
import { Tickets } from "../features/tickets/tickets";
import { Admin } from "../features/admin/admin";
import { Orders } from "../features/orders/orders";
import { Navigation } from "./navigation";
import { api, restoreSession, User } from "../shared/api/client";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { AuthMode, Screen, resolveRoute, safeReturnTo } from "./routing";
import { AuthPanel } from "../features/auth/auth-panel";
import { useAuthActions } from "../features/auth/use-auth-actions";

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const route = resolveRoute(location.pathname);
  const screen = route.screen;
  const [restoring, setRestoring] = useState(true);
  function setScreen(next: Screen) {
    const paths: Partial<Record<Screen, string>> = {
      catalog: "/products",
      cart: "/checkout",
      orders: user?.role === "CUSTOMER" ? "/orders" : "/staff/orders",
      inventory: "/staff/inventory",
      tickets:
        user && ["SUPPORT", "ADMIN"].includes(user.role)
          ? "/staff/tickets"
          : "/tickets",
      admin: "/admin/catalog",
      auth: user ? "/account" : "/login",
    };
    navigate(paths[next] ?? "/products");
  }
  function setMode(next: AuthMode) {
    const paths = {
      login: "/login",
      register: "/register",
      verify: "/verify-email",
      account: "/account",
    };
    const target = new URLSearchParams(window.location.search).get("next");
    navigate(
      next === "account" && target
        ? safeReturnTo(target)
        : paths[next] +
            (target ? "?next=" + encodeURIComponent(safeReturnTo(target)) : ""),
    );
  }
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      const saved = localStorage.getItem("shopfast:theme");
      if (saved === "light" || saved === "dark") return saved;
    } catch {
      /* Storage may be disabled. */
    }
    return matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("shopfast:theme", theme);
    } catch {
      /* Optional preference. */
    }
  }, [theme]);
  const [accessToken, setAccessToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const mode: AuthMode =
    route.mode ?? (user ? (user.verified ? "account" : "verify") : "register");
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cartRevision, setCartRevision] = useState(0);
  const [cartCount, setCartCount] = useState<number | null>(null);
  const [cartRequested, setCartRequested] = useState(false);
  const canShop = Boolean(user?.verified && user.role === "CUSTOMER");
  useEffect(() => {
    let active = true;
    if (canShop) {
      api<{ items: { quantity: number }[] }>("/cart", {}, accessToken)
        .then((result) => {
          if (active)
            setCartCount(
              result.items.reduce((sum, item) => sum + item.quantity, 0),
            );
        })
        .catch(() => {
          /* The cart page displays its own retryable API error. */
        });
    }
    return () => {
      active = false;
    };
  }, [canShop, user?.id, accessToken, cartRevision, screen]);
  useEffect(() => {
    setCartCount(null);
  }, [user?.id]);
  useEffect(() => {
    if (cartRequested && canShop) {
      setScreen("cart");
      setCartRequested(false);
    }
  }, [cartRequested, canShop]);
  const [rateUntil, setRateUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [resendUntil, setResendUntil] = useState(0);
  useEffect(() => {
    const until = Math.max(rateUntil, resendUntil);
    if (until <= Date.now()) return;
    setNow(Date.now());
    const timer = setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time >= until) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [rateUntil, resendUntil]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);
  useEffect(() => {
    let active = true;
    const session = (event: Event) => {
      const data = (event as CustomEvent).detail;
      if (data) {
        setAccessToken(data.accessToken);
        setUser(data.user);
      } else {
        setUser(null);
        setAccessToken("");
        navigate(
          "/login?next=" +
            encodeURIComponent(
              safeReturnTo(window.location.pathname + window.location.search),
            ),
          { replace: true },
        );
      }
    };
    const rate = (event: Event) =>
      setRateUntil(
        Date.now() + Math.max(1, (event as CustomEvent).detail) * 1000,
      );
    window.addEventListener("shopfast:session", session);
    window.addEventListener("shopfast:rate-limited", rate);
    restoreSession()
      .then((result) => {
        if (active) {
          setAccessToken(result.accessToken);
          setUser(result.user);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setRestoring(false);
      });
    return () => {
      active = false;
      window.removeEventListener("shopfast:session", session);
      window.removeEventListener("shopfast:rate-limited", rate);
    };
  }, []);
  const { submit, logout, resend } = useAuthActions({
    mode,
    accessToken,
    user,
    setBusy,
    setMessage,
    setMessageError,
    setAccessToken,
    setUser,
    setMode,
    setResendUntil,
  });
  const rateNotice =
    rateUntil > now ? (
      <p className="rate-notice" role="status">
        Bạn thao tác quá nhanh. Thử lại sau{" "}
        {Math.ceil((rateUntil - now) / 1000)} giây.
      </p>
    ) : null;
  const navigation = (
    <Navigation
      screen={screen}
      setScreen={setScreen}
      user={user}
      accessToken={accessToken}
      canShop={canShop}
      cartCount={cartCount}
      cartRevision={cartRevision}
      setCartRevision={setCartRevision}
      theme={theme}
      setTheme={setTheme}
      onCartLogin={() => {
        setCartRequested(true);
        setMode(user ? "verify" : "login");
        setMessageError(false);
        setMessage(
          user
            ? "Xác minh email để sử dụng giỏ hàng."
            : "Đăng nhập để sử dụng giỏ hàng.",
        );
      }}
    />
  );
  const statusPage = (title: string, text: string) => (
    <>
      {navigation}
      <main className="workspace">
        <h1>{title}</h1>
        <p>{text}</p>
        <button onClick={() => setScreen("catalog")}>Về cửa hàng</button>
      </main>
    </>
  );
  if (location.pathname === "/") return <Navigate replace to="/products" />;
  if (route.roles !== undefined) {
    if (restoring)
      return statusPage(
        "Đang khôi phục phiên…",
        "Vui lòng chờ trong giây lát.",
      );
    const next = encodeURIComponent(location.pathname + location.search);
    if (!user) return <Navigate replace to={"/login?next=" + next} />;
    if (!route.unverified && !user.verified)
      return <Navigate replace to={"/verify-email?next=" + next} />;
    if (route.roles.length && !route.roles.includes(user.role))
      return statusPage(
        "403 — Không có quyền truy cập",
        "Tài khoản của bạn không được phép truy cập khu vực này.",
      );
  }
  if (screen === "notfound")
    return statusPage(
      "404 — Không tìm thấy trang",
      "Đường dẫn này không tồn tại.",
    );
  if (screen === "orders" && user)
    return (
      <>
        {navigation}
        {rateNotice}
        <main className="cart-page">
          <Orders
            api={api}
            token={accessToken}
            staff={location.pathname.startsWith("/staff/")}
            showCart={false}
            revision={cartRevision}
            onChange={() => setCartRevision((value) => value + 1)}
            routeId={route.id}
            basePath={
              location.pathname.startsWith("/staff/")
                ? "/staff/orders"
                : "/orders"
            }
            onNavigate={(path) => navigate(path)}
          />
        </main>
      </>
    );
  if (screen === "cart" && canShop)
    return (
      <>
        {navigation}
        {rateNotice}
        <main className="cart-page">
          <button
            type="button"
            className="switch"
            onClick={() => setScreen("catalog")}
          >
            ← Tiếp tục mua sắm
          </button>
          <Orders
            api={api}
            token={accessToken}
            staff={false}
            revision={cartRevision}
            onChange={() => setCartRevision((value) => value + 1)}
            onNavigate={(path) => navigate(path)}
            basePath="/orders"
            checkoutEnabled={location.pathname !== "/cart"}
          />
        </main>
      </>
    );
  if (screen === "tickets" && user?.verified)
    return (
      <>
        {navigation}
        {rateNotice}
        <Tickets
          api={api}
          token={accessToken}
          userId={user.id}
          staff={["SUPPORT", "ADMIN"].includes(user.role)}
          routeId={route.id}
          basePath={
            location.pathname.startsWith("/staff/")
              ? "/staff/tickets"
              : "/tickets"
          }
          onNavigate={(path) => navigate(path)}
        />
      </>
    );
  if (screen === "admin" && user?.verified && user.role === "ADMIN")
    return (
      <>
        {navigation}
        {rateNotice}
        <Admin api={api} token={accessToken} panel={route.panel} />
      </>
    );
  if (screen === "catalog" || screen === "inventory")
    return (
      <>
        {navigation}
        {rateNotice}
        <Catalog
          api={api}
          token={accessToken}
          productId={screen === "catalog" ? route.id : undefined}
          onOpenProduct={(id) =>
            navigate("/products/" + encodeURIComponent(id) + location.search, {
              state: { productOverlay: true },
            })
          }
          onCloseProduct={() =>
            location.state?.productOverlay
              ? navigate(-1)
              : navigate("/products" + location.search, { replace: true })
          }
          inventoryOnly={screen === "inventory"}
          onCartChange={() => setCartRevision((value) => value + 1)}
          customer={Boolean(user?.verified && user.role === "CUSTOMER")}
          staff={Boolean(
            user?.verified && ["WAREHOUSE", "ADMIN"].includes(user.role),
          )}
        />
      </>
    );
  return (
    <>
      {navigation}
      {rateNotice}
      <AuthPanel
        mode={mode}
        user={user}
        busy={busy}
        message={message}
        messageError={messageError}
        rateUntil={rateUntil}
        now={now}
        resendUntil={resendUntil}
        setScreen={setScreen}
        setMode={setMode}
        setMessage={setMessage}
        submit={submit}
        logout={logout}
        resend={resend}
      />
    </>
  );
}
