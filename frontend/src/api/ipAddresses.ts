import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "./index";
import type { IPAddressRead, Page } from "@/types";

const KEY = "ip-addresses";

export function useIPAddresses(params?: Record<string, unknown>) {
  return useQuery<Page<IPAddressRead>>({
    queryKey: [KEY, params],
    queryFn: async () => {
      const { data } = await api.get("/ip-addresses", { params: { page: 1, size: 200, ...params } });
      return data;
    },
  });
}

export function useIPAddress(id: string) {
  return useQuery<IPAddressRead>({
    queryKey: [KEY, id],
    queryFn: async () => {
      const { data } = await api.get(`/ip-addresses/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useAvailableIPs(subnetId: string) {
  return useQuery<IPAddressRead[]>({
    queryKey: [KEY, "available", subnetId],
    queryFn: async () => {
      const { data } = await api.get("/ip-addresses/available", { params: { subnet_id: subnetId } });
      return data;
    },
    enabled: !!subnetId,
  });
}

export function useCreateIPAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.post("/ip-addresses", body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateIPAddress(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.patch(`/ip-addresses/${id}`, body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteIPAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/ip-addresses/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
