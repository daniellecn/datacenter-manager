import { useMutation, useQuery } from "@tanstack/react-query";
import api from "./index";
import { useAuthStore } from "@/store/authStore";
import type { TokenResponse, UserRead } from "@/types";

export function useLogin() {
  const { setTokens } = useAuthStore();
  return useMutation({
    mutationFn: async (creds: { username: string; password: string }) => {
      const { data } = await api.post<TokenResponse>("/auth/login", creds);
      return data;
    },
    onSuccess: (data) => {
      setTokens(data.access_token, data.refresh_token);
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
  const { clearAuth, refreshToken } = useAuthStore();
  return useMutation({
    mutationFn: async () => {
      await api.post("/auth/logout", { refresh_token: refreshToken });
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
