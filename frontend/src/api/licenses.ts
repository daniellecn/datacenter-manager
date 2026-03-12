import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "./index";
import type { LicenseRead, Page } from "@/types";

const KEY = "licenses";

export function useLicenses(params?: { device_id?: string; page?: number; size?: number }) {
  return useQuery<Page<LicenseRead>>({
    queryKey: [KEY, params],
    queryFn: async () => {
      const { data } = await api.get("/licenses", { params: { page: 1, size: 100, ...params } });
      return data;
    },
  });
}

export function useExpiringLicenses(days = 90) {
  return useQuery<LicenseRead[]>({
    queryKey: [KEY, "expiring", days],
    queryFn: async () => {
      const { data } = await api.get("/licenses/expiring", { params: { days } });
      return data;
    },
  });
}

export function useLicense(id: string) {
  return useQuery<LicenseRead>({
    queryKey: [KEY, id],
    queryFn: async () => {
      const { data } = await api.get(`/licenses/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateLicense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.post("/licenses", body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateLicense(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.patch(`/licenses/${id}`, body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteLicense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/licenses/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
