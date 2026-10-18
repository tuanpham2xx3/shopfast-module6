export type User = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  verified: boolean;
};
export const API =
  import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:3000/api/v1";
let currentToken = "";
let restoration: Promise<{ accessToken: string; user: User }> | undefined;
export const getAccessToken = () => currentToken;
export function restoreSession() {
  return (restoration ??= api<{ accessToken: string; user: User }>(
    "/auth/refresh",
    { method: "POST" },
  ).finally(() => {
    restoration = undefined;
  }));
}
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryAfter: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
  retried = false,
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(token || currentToken
        ? { authorization: `Bearer ${currentToken || token}` }
        : {}),
      ...options.headers,
    },
  });
  if (
    response.status === 401 &&
    token &&
    !retried &&
    !path.startsWith("/auth/")
  ) {
    try {
      const result = await restoreSession();
      return api<T>(path, options, result.accessToken, true);
    } catch {
      currentToken = "";
      window.dispatchEvent(
        new CustomEvent("shopfast:session", { detail: null }),
      );
    }
  }
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const retryAfter = Math.max(
      0,
      Number(response.headers.get("Retry-After")) || 0,
    );
    if (response.status === 429)
      window.dispatchEvent(
        new CustomEvent("shopfast:rate-limited", { detail: retryAfter }),
      );
    throw new ApiError(
      body?.error?.code ?? "REQUEST_FAILED",
      body?.error?.message ?? "Không thể xử lý yêu cầu.",
      retryAfter,
    );
  }
  if (
    ["/auth/login", "/auth/register", "/auth/refresh"].includes(path) &&
    body?.data?.accessToken
  ) {
    currentToken = body.data.accessToken;
    window.dispatchEvent(
      new CustomEvent("shopfast:session", { detail: body.data }),
    );
  }
  if (path === "/auth/logout") {
    currentToken = "";
    window.dispatchEvent(new CustomEvent("shopfast:session", { detail: null }));
  }
  return body?.data as T;
}
