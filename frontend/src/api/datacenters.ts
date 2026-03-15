import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "./index";
import type { DataCenterRead, Page } from "@/types";

const KEY = "datacenters";

export function useDataCenters(page = 1, size = 50) {
  return useQuery<Page<DataCenterRead>>({
    queryKey: [KEY, page, size],
    queryFn: async () => {
      const { data } = await api.get("/datacenters", { params: { page, size } });
      return data;
    },
  });
}

export function useDataCenter(id: string) {
  return useQuery<DataCenterRead>({
    queryKey: [KEY, id],
    queryFn: async () => {
      const { data } = await api.get(`/datacenters/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateDataCenter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.post("/datacenters", body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateDataCenter(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.put(`/datacenters/${id}`, body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteDataCenter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/datacenters/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
