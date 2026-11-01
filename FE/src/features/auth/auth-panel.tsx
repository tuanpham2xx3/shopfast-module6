import { FormEvent, useEffect, useState } from "react";
import { User } from "../../shared/api/client";
import { AuthMode, Screen } from "../../app/routing";
import { AccountSummary } from "../account/account-summary";
interface Props {
  mode: AuthMode;
  user: User | null;
  busy: boolean;
  message: string;
  messageError: boolean;
  rateUntil: number;
  now: number;
  resendUntil: number;
  setScreen: (screen: Screen) => void;
  setMode: (mode: AuthMode) => void;
  setMessage: (message: string) => void;
  submit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  logout: () => Promise<void>;
  resend: () => Promise<void>;
}
export function AuthPanel({
  mode,
  user,
  busy,
  message,
  messageError,
  rateUntil,
  now,
  resendUntil,
  setScreen,
  setMode,
  setMessage,
  submit,
  logout,
  resend,
}: Props) {
  const [showPassword, setShowPassword] = useState(false);
  useEffect(() => setShowPassword(false), [mode]);
  return (
    <main className="shell">
      <section className="auth" aria-live="polite">
        <header>
          {mode === "account" && <p>Tài khoản</p>}
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
          <AccountSummary
            user={user}
            busy={busy}
            onShop={() => setScreen("catalog")}
            logout={logout}
          />
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
  );
}
