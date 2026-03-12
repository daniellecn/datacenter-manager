import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "./index";
import type { Page, RoomRead } from "@/types";

const KEY = "rooms";

export function useRooms(params?: { datacenter_id?: string; page?: number; size?: number }) {
  return useQuery<Page<RoomRead>>({
    queryKey: [KEY, params],
    queryFn: async () => {
      const { data } = await api.get("/rooms", { params: { page: 1, size: 100, ...params } });
      return data;
    },
  });
}

export function useRoom(id: string) {
  return useQuery<RoomRead>({
    queryKey: [KEY, id],
    queryFn: async () => {
      const { data } = await api.get(`/rooms/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.post("/rooms", body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateRoom(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.patch(`/rooms/${id}`, body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/rooms/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
