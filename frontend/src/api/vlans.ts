import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "./index";
import type { Page, VLANRead } from "@/types";

const KEY = "vlans";

export function useVLANs(params?: { page?: number; size?: number }) {
  return useQuery<Page<VLANRead>>({
    queryKey: [KEY, params],
    queryFn: async () => {
      const { data } = await api.get("/vlans", { params: { page: 1, size: 200, ...params } });
      return data;
    },
  });
}

export function useVLAN(id: string) {
  return useQuery<VLANRead>({
    queryKey: [KEY, id],
    queryFn: async () => {
      const { data } = await api.get(`/vlans/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateVLAN() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.post("/vlans", body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateVLAN(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.patch(`/vlans/${id}`, body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteVLAN() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/vlans/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
