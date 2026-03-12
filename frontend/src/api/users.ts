import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "./index";
import type { Page, UserRead } from "@/types";

const KEY = "users";

export function useUsers(params?: { page?: number; size?: number }) {
  return useQuery<Page<UserRead>>({
    queryKey: [KEY, params],
    queryFn: async () => {
      const { data } = await api.get("/users", { params: { page: 1, size: 100, ...params } });
      return data;
    },
  });
}

export function useUser(id: string) {
  return useQuery<UserRead>({
    queryKey: [KEY, id],
    queryFn: async () => {
      const { data } = await api.get(`/users/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.post("/users", body);
      return data as UserRead;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateUser(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.patch(`/users/${id}`, body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useResetUserPassword(id: string) {
  return useMutation({
    mutationFn: async (newPassword: string) => {
      const { data } = await api.post(`/users/${id}/reset-password`, { new_password: newPassword });
      return data;
    },
  });
}
