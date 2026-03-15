import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "./index";
import type { DeviceTypeRead, DeviceTypeCreate, DeviceTypeUpdate } from "@/types";

const KEY = ["device-types"];

export function useDeviceTypes() {
  return useQuery<DeviceTypeRead[]>({
    queryKey: KEY,
    queryFn: async () => {
      const { data } = await api.get("/device-types");
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 min — types change rarely
  });
}

export function useCreateDeviceType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DeviceTypeCreate) => api.post("/device-types", body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateDeviceType(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DeviceTypeUpdate) =>
      api.put(`/device-types/${id}`, body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteDeviceType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/device-types/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
