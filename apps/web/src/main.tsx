import React, { FormEvent, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:3000/api/v1";
type User = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  verified: boolean;
};

async function api<T>(
  path: string,
  options: RequestInit = {},
  accessToken?: string,
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok)
    throw new Error(body?.error?.message ?? "Không thể xử lý yêu cầu.");
  return body?.data as T;
}

function App() {
  const [mode, setMode] = useState<"register" | "verify" | "login" | "account">(
    "register",
  );
  const [accessToken, setAccessToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api<{ accessToken: string; user: User }>("/auth/refresh", {
      method: "POST",
    })
      .then((result) => {
        if (!active) return;
        setAccessToken(result.accessToken);
        setUser(result.user);
        setMode(result.user.verified ? "account" : "verify");
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (mode === "register") {
        const result = await api<{ accessToken: string; user: User }>(
          "/auth/register",
          { method: "POST", body: JSON.stringify(data) },
        );
        setAccessToken(result.accessToken);
        setUser(result.user);
        setMode("verify");
        setMessage("Mã xác minh đã được gửi. Mã có hiệu lực trong 10 phút.");
      } else if (mode === "verify") {
        const verified = await api<User>(
          "/auth/verification/confirm",
          { method: "POST", body: JSON.stringify({ code: data.code }) },
          accessToken,
        );
        setUser(verified);
        setMode("account");
        setMessage("Email đã được xác minh.");
      } else if (mode === "login") {
        const result = await api<{ accessToken: string; user: User }>(
          "/auth/login",
          { method: "POST", body: JSON.stringify(data) },
        );
        setAccessToken(result.accessToken);
        setUser(result.user);
        setMode(result.user.verified ? "account" : "verify");
      }
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      setAccessToken("");
      setUser(null);
      setMode("login");
      setBusy(false);
    }
  }

  return (
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
          Một cửa hàng demo chú trọng tính đúng đắn của tồn kho, đơn hàng và bảo
          mật tài khoản.
        </p>
        <ul>
          <li>Giá và tồn kho được xác nhận ở máy chủ</li>
          <li>Đơn hàng có lịch sử trạng thái minh bạch</li>
          <li>AI chỉ đề xuất, con người xác nhận thao tác ghi</li>
        </ul>
      </section>
      <section className="auth" aria-live="polite">
        <header>
          <p>{mode === "account" ? "Tài khoản" : "Bắt đầu"}</p>
          <h2>
            {mode === "register"
              ? "Tạo tài khoản"
              : mode === "verify"
                ? "Xác minh email"
                : mode === "login"
                  ? "Đăng nhập"
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
            <button onClick={logout} disabled={busy}>
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
                      mode === "register" ? "new-password" : "current-password"
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
            <button disabled={busy}>
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
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
