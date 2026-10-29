import { FormEvent } from "react";
import { api, User } from "../../shared/api/client";
import { AuthMode } from "../../app/routing";
interface Options {
  mode: AuthMode;
  accessToken: string;
  user: User | null;
  setBusy: (value: boolean) => void;
  setMessage: (value: string) => void;
  setMessageError: (value: boolean) => void;
  setAccessToken: (value: string) => void;
  setUser: (value: User | null) => void;
  setMode: (value: AuthMode) => void;
  setResendUntil: (value: number) => void;
}
export function useAuthActions({
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
}: Options) {
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

  return { submit, logout, resend };
}
