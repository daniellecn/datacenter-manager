import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "./index";
import type { IPNetworkRead, Page } from "@/types";

const KEY = "ip-networks";

export function useIPNetworks(params?: Record<string, unknown>) {
  return useQuery<Page<IPNetworkRead>>({
    queryKey: [KEY, params],
    queryFn: async () => {
      const { data } = await api.get("/ip-networks", { params: { page: 1, size: 200, ...params } });
      return data;
    },
  });
}

export function useIPNetwork(id: string) {
  return useQuery<IPNetworkRead>({
    queryKey: [KEY, id],
    queryFn: async () => {
      const { data } = await api.get(`/ip-networks/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateIPNetwork() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.post("/ip-networks", body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateIPNetwork(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.patch(`/ip-networks/${id}`, body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteIPNetwork() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/ip-networks/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
