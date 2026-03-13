import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "./index";
import type { CorridorRead, Page, RackRead } from "@/types";

const KEY = "corridors";

export function useCorridors(params?: { room_id?: string; page?: number; size?: number }) {
  return useQuery<Page<CorridorRead>>({
    queryKey: [KEY, params],
    queryFn: async () => {
      const { data } = await api.get("/corridors", { params: { page: 1, size: 200, ...params } });
      return data;
    },
  });
}

export function useCorridor(id: string) {
  return useQuery<CorridorRead>({
    queryKey: [KEY, id],
    queryFn: async () => {
      const { data } = await api.get(`/corridors/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useCorridorRacks(corridorId: string) {
  return useQuery<Page<RackRead>>({
    queryKey: [KEY, corridorId, "racks"],
    queryFn: async () => {
      const { data } = await api.get(`/corridors/${corridorId}/racks`, {
        params: { page: 1, size: 200 },
      });
      return data;
    },
    enabled: !!corridorId,
  });
}

export function useCreateCorridor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.post("/corridors", body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateCorridor(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.put(`/corridors/${id}`, body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteCorridor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/corridors/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
