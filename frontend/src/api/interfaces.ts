import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "./index";
import type { NetworkInterfaceRead, Page } from "@/types";

const KEY = "interfaces";

export function useInterfaces(params?: { device_id?: string; page?: number; size?: number }) {
  return useQuery<Page<NetworkInterfaceRead>>({
    queryKey: [KEY, params],
    queryFn: async () => {
      const { data } = await api.get("/interfaces", { params: { page: 1, size: 200, ...params } });
      return data;
    },
  });
}

export function useInterface(id: string) {
  return useQuery<NetworkInterfaceRead>({
    queryKey: [KEY, id],
    queryFn: async () => {
      const { data } = await api.get(`/interfaces/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateInterface() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.post("/interfaces", body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateInterface(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.patch(`/interfaces/${id}`, body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteInterface() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/interfaces/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
