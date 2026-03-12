import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "./index";
import type { LAGGroupRead, NetworkLinkRead, Page } from "@/types";

const LINK_KEY = "links";
const LAG_KEY = "lag-groups";

// ─── Network Links ─────────────────────────────────────────────────────────

export function useLinks(params?: Record<string, unknown>) {
  return useQuery<Page<NetworkLinkRead>>({
    queryKey: [LINK_KEY, params],
    queryFn: async () => {
      const { data } = await api.get("/links", { params: { page: 1, size: 200, ...params } });
      return data;
    },
  });
}

export function useCreateLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.post("/links", body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [LINK_KEY] }),
  });
}

export function useUpdateLink(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.patch(`/links/${id}`, body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [LINK_KEY] }),
  });
}

export function useDeleteLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/links/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [LINK_KEY] }),
  });
}

// ─── LAG Groups ────────────────────────────────────────────────────────────

export function useLAGGroups(params?: { device_id?: string }) {
  return useQuery<Page<LAGGroupRead>>({
    queryKey: [LAG_KEY, params],
    queryFn: async () => {
      const { data } = await api.get("/lag-groups", { params: { page: 1, size: 100, ...params } });
      return data;
    },
  });
}

export function useCreateLAGGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.post("/lag-groups", body);
      return data as LAGGroupRead;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [LAG_KEY] }),
  });
}

export function useDeleteLAGGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/lag-groups/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [LAG_KEY] }),
  });
}
