import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "./index";
import type { IntegrationRead, Page, SyncLogRead } from "@/types";

const KEY = "integrations";

export function useIntegrations(params?: { page?: number; size?: number }) {
  return useQuery<Page<IntegrationRead>>({
    queryKey: [KEY, params],
    queryFn: async () => {
      const { data } = await api.get("/integrations", { params: { page: 1, size: 100, ...params } });
      return data;
    },
  });
}

export function useIntegration(id: string) {
  return useQuery<IntegrationRead>({
    queryKey: [KEY, id],
    queryFn: async () => {
      const { data } = await api.get(`/integrations/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useIntegrationSyncLogs(id: string) {
  return useQuery<SyncLogRead[]>({
    queryKey: [KEY, id, "sync-logs"],
    queryFn: async () => {
      const { data } = await api.get(`/integrations/${id}/sync-logs`);
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.post("/integrations", body);
      return data as IntegrationRead;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateIntegration(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.patch(`/integrations/${id}`, body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/integrations/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useTriggerSync(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/integrations/${id}/sync`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, id] });
      qc.invalidateQueries({ queryKey: [KEY, id, "sync-logs"] });
    },
  });
}
