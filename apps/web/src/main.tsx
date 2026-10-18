import React, { FormEvent, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { Catalog } from "./catalog";
import { Tickets } from "./tickets";
import { Admin } from "./admin";
import { api, restoreSession, User } from "./client";

function App() {
  const [mode, setMode] = useState<"register" | "verify" | "login" | "account">(
    "register",
  );
  const [accessToken, setAccessToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [screen, setScreen] = useState<
    "auth" | "catalog" | "tickets" | "admin"
  >("auth");
  const [rateUntil, setRateUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [resendUntil, setResendUntil] = useState(0);
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
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setMessage("");
    try {
      await api("/auth/logout", { method: "POST" });
      setAccessToken("");
      setUser(null);
      setMode("login");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    if (!user) return;
    setBusy(true);
    try {
      await api("/auth/verification/send", {
        method: "POST",
        body: JSON.stringify({ email: user.email }),
      });
      setMessage("Yêu cầu gửi mã đã được tiếp nhận.");
      setResendUntil(Date.now() + 60000);
    } catch (e) {
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
    <nav className="topnav">
      <strong>ShopFast</strong>
      <div className="nav-actions">
        <button onClick={() => setScreen("catalog")}>Cửa hàng</button>
        {user?.verified && (
          <button onClick={() => setScreen("tickets")}>Hỗ trợ</button>
        )}
        {user?.verified && user.role === "ADMIN" && (
          <button onClick={() => setScreen("admin")}>Quản trị</button>
        )}
        <button onClick={() => setScreen("auth")}>
          {user ? "Tài khoản" : "Đăng nhập / Đăng ký"}
        </button>
      </div>
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
      {rateNotice}
      <main className="shell">
        <section className="intro" aria-labelledby="brand-title">
          <span className="mark" aria-hidden="true">
            SF
          </span>
          <div>
            <p className="eyebrow">ShopFast</p>
            <h1 id="brand-title">
              Mua sắm gọn gàng.
              <br />
              Theo dõi rõ ràng.
            </h1>
          </div>
          <p className="promise">
            Một cửa hàng demo chú trọng tính đúng đắn của tồn kho, đơn hàng và
            bảo mật tài khoản.
          </p>
          <ul>
            <li>Giá và tồn kho được xác nhận ở máy chủ</li>
            <li>Đơn hàng có lịch sử trạng thái minh bạch</li>
            <li>AI chỉ đề xuất, con người xác nhận thao tác ghi</li>
          </ul>
          <button onClick={() => setScreen("catalog")}>
            Khám phá sản phẩm
          </button>
          {user?.verified && (
            <button onClick={() => setScreen("tickets")}>Mở hỗ trợ</button>
          )}
          {user?.verified && user.role === "ADMIN" && (
            <button onClick={() => setScreen("admin")}>Mở quản trị</button>
          )}
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
                      type="email"
                      autoComplete="email"
                      required
                    />
                  </label>
                  <label>
                    Mật khẩu
                    <input
                      name="password"
                      type="password"
                      autoComplete={
                        mode === "register"
                          ? "new-password"
                          : "current-password"
                      }
                      minLength={10}
                      maxLength={128}
                      required
                    />
                  </label>
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
                <p className="message" role="status">
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
