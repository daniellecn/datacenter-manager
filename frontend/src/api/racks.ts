import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "./index";
import type { DeviceRead, Page, RackPowerSummary, RackRead } from "@/types";

const KEY = "racks";

export function useRacks(params?: { corridor_id?: string; room_id?: string; page?: number; size?: number }) {
  return useQuery<Page<RackRead>>({
    queryKey: [KEY, params],
    queryFn: async () => {
      const { data } = await api.get("/racks", { params: { page: 1, size: 100, ...params } });
      return data;
    },
  });
}

export function useRack(id: string) {
  return useQuery<RackRead>({
    queryKey: [KEY, id],
    queryFn: async () => {
      const { data } = await api.get(`/racks/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useRackDevices(id: string) {
  return useQuery<DeviceRead[]>({
    queryKey: [KEY, id, "devices"],
    queryFn: async () => {
      const { data } = await api.get(`/racks/${id}/devices`);
      return data;
    },
    enabled: !!id,
  });
}

export function useRackPowerSummary(id: string) {
  return useQuery<RackPowerSummary>({
    queryKey: [KEY, id, "power"],
    queryFn: async () => {
      const { data } = await api.get(`/racks/${id}/power-summary`);
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateRack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.post("/racks", body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateRack(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.put(`/racks/${id}`, body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteRack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/racks/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
