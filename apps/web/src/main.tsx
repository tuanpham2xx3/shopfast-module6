import React, { FormEvent, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/600.css";
import "@fontsource/be-vietnam-pro/700.css";
import "./styles.css";
import { Catalog } from "./catalog";
import { Tickets } from "./tickets";
import { Admin } from "./admin";
import { api, restoreSession, User } from "./client";

function App() {
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
  const [showPassword, setShowPassword] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("shopfast:theme", theme);
    } catch {
      /* Optional preference. */
    }
  }, [theme]);
  const [mode, setMode] = useState<"register" | "verify" | "login" | "account">(
    "register",
  );
  const [accessToken, setAccessToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [screen, setScreen] = useState<
    "auth" | "catalog" | "tickets" | "admin"
  >("auth");
  const [rateUntil, setRateUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [resendUntil, setResendUntil] = useState(0);
  useEffect(() => {
    setShowPassword(false);
  }, [mode]);
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
        setMode(data.user.verified ? "account" : "verify");
      } else {
        setUser(null);
        setAccessToken("");
        setMode("login");
        setScreen("auth");
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
          setMode(result.user.verified ? "account" : "verify");
        }
      })
      .catch(() => undefined);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("shopfast:session", session);
      window.removeEventListener("shopfast:rate-limited", rate);
    };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setMessageError(false);
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (mode === "verify") {
        const verified = await api<User>(
          "/auth/verification/confirm",
          { method: "POST", body: JSON.stringify({ code: data.code }) },
          accessToken,
        );
        setUser(verified);
        setMode("account");
        setMessage("Email đã được xác minh.");
      } else {
        const result = await api<{ accessToken: string; user: User }>(
          mode === "register" ? "/auth/register" : "/auth/login",
          { method: "POST", body: JSON.stringify(data) },
        );
        setAccessToken(result.accessToken);
        setUser(result.user);
        setMode(result.user.verified ? "account" : "verify");
        if (mode === "register") {
          setMessage("Mã xác minh đã được gửi. Mã có hiệu lực trong 10 phút.");
          setResendUntil(Date.now() + 60000);
        }
      }
    } catch (e) {
      setMessageError(true);
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setMessage("");
    setMessageError(false);
    try {
      await api("/auth/logout", { method: "POST" });
      setAccessToken("");
      setUser(null);
      setMode("login");
    } catch (e) {
      setMessageError(true);
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    if (!user) return;
    setBusy(true);
    setMessageError(false);
    try {
      await api("/auth/verification/send", {
        method: "POST",
        body: JSON.stringify({ email: user.email }),
      });
      setMessage("Yêu cầu gửi mã đã được tiếp nhận.");
      setResendUntil(Date.now() + 60000);
    } catch (e) {
      setMessageError(true);
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const rateNotice =
    rateUntil > now ? (
      <p className="rate-notice" role="status">
        Bạn thao tác quá nhanh. Thử lại sau{" "}
        {Math.ceil((rateUntil - now) / 1000)} giây.
      </p>
    ) : null;
  const navigation = (
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
          onClick={() => setScreen("auth")}
        >
          {user ? "Tài khoản" : "Đăng nhập / Đăng ký"}
        </button>
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
        {theme === "light" ? "Chế độ tối" : "Chế độ sáng"}
      </button>
    </nav>
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
        />
      </>
    );
  if (screen === "admin" && user?.verified && user.role === "ADMIN")
    return (
      <>
        {navigation}
        {rateNotice}
        <Admin api={api} token={accessToken} />
      </>
    );
  if (screen === "catalog")
    return (
      <>
        {navigation}
        {rateNotice}
        <Catalog
          api={api}
          token={accessToken}
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
      <main className="shell">
        <section className="intro" aria-labelledby="brand-title">
          <div className="intro-content">
            <p className="eyebrow">Mỗi ngày, dễ dàng hơn</p>
            <h1 id="brand-title">
              Mua sắm gọn gàng.
              <br />
              Theo dõi rõ ràng.
            </h1>
            <p className="promise">
              Chọn món bạn thích, đặt hàng và theo dõi hành trình giao hàng ngay
              tại một nơi.
            </p>
            <button className="intro-cta" onClick={() => setScreen("catalog")}>
              Khám phá sản phẩm <span aria-hidden="true">↗</span>
            </button>
          </div>
          <ul>
            <li>
              <strong>Rõ ràng từ lúc chọn</strong>
              <span>Xem giá và số lượng còn hàng trước khi đặt.</span>
            </li>
            <li>
              <strong>An tâm theo dõi</strong>
              <span>Cập nhật trạng thái và xem lại lịch sử đơn hàng.</span>
            </li>
            <li>
              <strong>Luôn có người hỗ trợ</strong>
              <span>Gửi yêu cầu và trao đổi với đội ngũ ShopFast.</span>
            </li>
          </ul>
          <div className="intro-actions">
            {user?.verified && (
              <button onClick={() => setScreen("tickets")}>Mở hỗ trợ</button>
            )}
            {user?.verified && user.role === "ADMIN" && (
              <button onClick={() => setScreen("admin")}>Mở quản trị</button>
            )}
          </div>
        </section>
        <section className="auth" aria-live="polite">
          <header>
            <p>{mode === "account" ? "Tài khoản" : "Bắt đầu"}</p>
            <h2>
              {mode === "register"
                ? "Tạo tài khoản"
                : mode === "login"
                  ? "Đăng nhập"
                  : mode === "verify"
                    ? "Xác minh email"
                    : `Chào ${user?.displayName}`}
            </h2>
          </header>
          <p className="auth-description">
            {mode === "register"
              ? "Tạo tài khoản để lưu giỏ hàng, theo dõi đơn và nhận hỗ trợ."
              : mode === "login"
                ? "Chào mừng trở lại. Tiếp tục với tài khoản của bạn."
                : mode === "verify"
                  ? `Nhập mã 6 chữ số đã gửi đến ${user?.email ?? "email của bạn"}.`
                  : "Thông tin và các lối tắt dành cho tài khoản của bạn."}
          </p>
          {mode === "account" ? (
            <div className="account">
              <dl>
                <div>
                  <dt>Email</dt>
                  <dd>{user?.email}</dd>
                </div>
                <div>
                  <dt>Vai trò</dt>
                  <dd>{user?.role}</dd>
                </div>
                <div>
                  <dt>Trạng thái</dt>
                  <dd>{user?.verified ? "Đã xác minh" : "Chờ xác minh"}</dd>
                </div>
              </dl>
              <button disabled={busy} onClick={logout}>
                Đăng xuất
              </button>
            </div>
          ) : (
            <form onSubmit={submit}>
              {mode === "register" && (
                <label>
                  Họ tên
                  <input
                    name="displayName"
                    placeholder="Tên của bạn"
                    autoComplete="name"
                    minLength={1}
                    maxLength={100}
                    required
                  />
                </label>
              )}
              {(mode === "register" || mode === "login") && (
                <>
                  <label>
                    Email
                    <input
                      name="email"
                      placeholder="ban@email.com"
                      type="email"
                      autoComplete="email"
                      required
                    />
                  </label>
                  <div className="field">
                    <label htmlFor="auth-password">Mật khẩu</label>
                    <div className="password-field">
                      <input
                        id="auth-password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        placeholder={
                          mode === "register"
                            ? "Tối thiểu 10 ký tự"
                            : "Nhập mật khẩu của bạn"
                        }
                        autoComplete={
                          mode === "register"
                            ? "new-password"
                            : "current-password"
                        }
                        minLength={10}
                        maxLength={128}
                        required
                      />
                      <button
                        type="button"
                        className="password-toggle"
                        aria-label={
                          showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"
                        }
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? "Ẩn" : "Hiện"}
                      </button>
                    </div>
                  </div>
                </>
              )}
              {mode === "verify" && (
                <label>
                  Mã xác minh
                  <input
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                  />
                </label>
              )}
              {message && (
                <p className="message" role={messageError ? "alert" : "status"}>
                  {message}
                </p>
              )}
              <button disabled={busy || rateUntil > now}>
                {busy
                  ? "Đang xử lý..."
                  : mode === "register"
                    ? "Tạo tài khoản"
                    : mode === "verify"
                      ? "Xác minh"
                      : "Đăng nhập"}
              </button>
            </form>
          )}
          {mode === "verify" && (
            <button
              className="switch"
              disabled={busy || resendUntil > now || rateUntil > now}
              onClick={resend}
            >
              {resendUntil > now
                ? `Gửi lại sau ${Math.ceil((resendUntil - now) / 1000)} giây`
                : "Gửi lại mã xác minh"}
            </button>
          )}
          {mode !== "account" && (
            <button
              className="switch"
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setMessage("");
              }}
            >
              {mode === "login"
                ? "Chưa có tài khoản? Đăng ký"
                : "Đã có tài khoản? Đăng nhập"}
            </button>
          )}
        </section>
      </main>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
