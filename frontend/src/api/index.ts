import axios from "axios";
import { useAuthStore } from "@/store/authStore";

const api = axios.create({
  baseURL: "/api/v1",
  headers: { "Content-Type": "application/json" },
  // Required so the browser sends the httpOnly refresh-token cookie on
  // cross-origin requests (dev: frontend :5173 → backend :8000 via proxy).
  withCredentials: true,
});

// Attach JWT access token on every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Token refresh ─────────────────────────────────────────────────────────────
// SECURITY: Only one refresh is ever in-flight at a time. All concurrent 401
// responses await the same Promise, eliminating the race condition where two
// simultaneous requests could both attempt to rotate the refresh token.

let refreshPromise: Promise<string | null> | null = null;

function doRefresh(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      // The refresh token is an httpOnly cookie — no body needed; the browser
      // sends it automatically.
      const { data } = await axios.post(
        "/api/v1/auth/refresh",
        {},
        { withCredentials: true }
      );
      useAuthStore.getState().setAccessToken(data.access_token);
      return data.access_token as string;
    } catch {
      useAuthStore.getState().clearAuth();
      window.location.href = "/login";
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (
      error.response?.status === 401 &&
      !original._retry &&
      original.url !== "/auth/refresh" &&
      original.url !== "/auth/login"
    ) {
      original._retry = true;
      const token = await doRefresh();
      if (!token) return Promise.reject(error);
      original.headers.Authorization = `Bearer ${token}`;
      return api(original);
    }
    return Promise.reject(error);
  }
);

export default api;
