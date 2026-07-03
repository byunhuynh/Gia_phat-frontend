import { API_BASE } from "../constants";

/**
 * Lấy access token từ storage (localStorage ưu tiên)
 */
export const getToken = (): string | null =>
  localStorage.getItem("access_token") ||
  sessionStorage.getItem("access_token");

/**
 * Xóa tất cả tokens khỏi storage
 */
export const clearTokens = (): void => {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
};

/**
 * Wrapper fetch với auto Authorization header
 */
export const apiFetch = async (
  path: string,
  options: RequestInit = {},
): Promise<Response> => {
  const token = getToken();
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
};

/**
 * Gọi API với auto token refresh khi gặp 401
 */
export const apiFetchWithRefresh = async (
  path: string,
  options: RequestInit = {},
): Promise<Response> => {
  let res = await apiFetch(path, options);

  if (res.status !== 401) return res;

  // Thử refresh token
  const refreshToken = localStorage.getItem("refresh_token");
  if (!refreshToken) {
    clearTokens();
    return res;
  }

  const refreshRes = await fetch(`${API_BASE}/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!refreshRes.ok) {
    clearTokens();
    return res;
  }

  const { access_token } = await refreshRes.json();
  localStorage.setItem("access_token", access_token);

  // Retry với token mới
  res = await apiFetch(path, options);
  return res;
};
