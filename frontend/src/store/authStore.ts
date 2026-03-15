import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserRead } from "@/types";

// SECURITY: accessToken is kept in memory only — never persisted to localStorage.
// Refresh tokens are stored exclusively in an httpOnly, SameSite=Strict cookie set
// by the backend. If the page is reloaded the app will silently call /auth/refresh
// (the cookie is sent automatically) to obtain a fresh access token.

interface AuthState {
  accessToken: string | null;
  user: UserRead | null;
  setAccessToken: (access: string) => void;
  setUser: (user: UserRead) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      setAccessToken: (access) => set({ accessToken: access }),
      setUser: (user) => set({ user }),
      clearAuth: () => set({ accessToken: null, user: null }),
    }),
    {
      name: "dcm-auth",
      // Only persist non-sensitive user profile — never tokens.
      partialize: (state) => ({ user: state.user }),
    }
  )
);
