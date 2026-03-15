import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "./index";
import type { DeviceDetailRead, DeviceNetworkRead, DevicePDURead, DeviceRead, DeviceServerRead, Page, PowerReading } from "@/types";

const KEY = "devices";

export function useDevices(params?: Record<string, unknown>) {
  return useQuery<Page<DeviceRead>>({
    queryKey: [KEY, params],
    queryFn: async () => {
      const { data } = await api.get("/devices", { params: { page: 1, size: 100, ...params } });
      return data;
    },
  });
}

export function useDevice(id: string) {
  return useQuery<DeviceDetailRead>({
    queryKey: [KEY, id],
    queryFn: async () => {
      const { data } = await api.get(`/devices/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useDevicePowerReadings(id: string) {
  return useQuery<PowerReading[]>({
    queryKey: [KEY, id, "power"],
    queryFn: async () => {
      const { data } = await api.get(`/devices/${id}/power-readings`);
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.post("/devices", body);
      return data as DeviceRead;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateDevice(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.put(`/devices/${id}`, body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/devices/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useChassisBlades(chassisId: string | null) {
  return useQuery<DeviceDetailRead[]>({
    queryKey: [KEY, "chassis-blades", chassisId],
    queryFn: async () => {
      const { data } = await api.get<Page<DeviceRead>>("/devices", {
        params: { blade_chassis_id: chassisId, size: 200 },
      });
      // Fetch full detail for each blade in parallel so blade_slot (server_detail) is available
      const details = await Promise.all(
        data.items.map(async (b) => {
          const { data: detail } = await api.get<DeviceDetailRead>(`/devices/${b.id}`);
          return detail;
        }),
      );
      return details;
    },
    enabled: !!chassisId,
  });
}

export function useUpsertServerDetail(deviceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.put(`/devices/${deviceId}/server-detail`, body);
      return data as DeviceServerRead;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, deviceId] }),
  });
}

export function useUpsertNetworkDetail(deviceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.put(`/devices/${deviceId}/network-detail`, body);
      return data as DeviceNetworkRead;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, deviceId] }),
  });
}

export function useUpsertPDUDetail(deviceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.put(`/devices/${deviceId}/pdu-detail`, body);
      return data as DevicePDURead;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, deviceId] }),
  });
}
