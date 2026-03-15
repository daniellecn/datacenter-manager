import { useMutation, useQuery } from "@tanstack/react-query";
import api from "./index";
import { useAuthStore } from "@/store/authStore";
import type { TokenResponse, UserRead } from "@/types";

export function useLogin() {
  const { setAccessToken } = useAuthStore();
  return useMutation({
    mutationFn: async (creds: { username: string; password: string }) => {
      const { data } = await api.post<TokenResponse>("/auth/login", creds);
      return data;
    },
    onSuccess: (data) => {
      // The backend sets the refresh token as an httpOnly cookie automatically.
      // We only store the short-lived access token in memory.
      setAccessToken(data.access_token);
    },
  });
}

export function useMe() {
  return useQuery<UserRead>({
    queryKey: ["me"],
    queryFn: async () => {
      const { data } = await api.get<UserRead>("/auth/me");
      return data;
    },
    retry: false,
  });
}

export function useLogout() {
  const { clearAuth } = useAuthStore();
  return useMutation({
    mutationFn: async () => {
      // No body needed — the backend reads the refresh token from the httpOnly
      // cookie and revokes it server-side.
      await api.post("/auth/logout", {});
    },
    onSettled: () => {
      clearAuth();
      window.location.href = "/login";
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (body: {
      current_password: string;
      new_password: string;
    }) => {
      const { data } = await api.post("/auth/change-password", body);
      return data;
    },
  });
}
