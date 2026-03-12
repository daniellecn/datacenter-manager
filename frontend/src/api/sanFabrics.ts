import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "./index";
import type { Page, SANFabricRead } from "@/types";

const KEY = "san-fabrics";

export function useSANFabrics(params?: { page?: number; size?: number }) {
  return useQuery<Page<SANFabricRead>>({
    queryKey: [KEY, params],
    queryFn: async () => {
      const { data } = await api.get("/san-fabrics", { params: { page: 1, size: 100, ...params } });
      return data;
    },
  });
}

export function useSANFabric(id: string) {
  return useQuery<SANFabricRead>({
    queryKey: [KEY, id],
    queryFn: async () => {
      const { data } = await api.get(`/san-fabrics/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateSANFabric() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.post("/san-fabrics", body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateSANFabric(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.patch(`/san-fabrics/${id}`, body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteSANFabric() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/san-fabrics/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
