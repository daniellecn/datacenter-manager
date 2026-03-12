import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "./index";
import type { AlertRead, Page } from "@/types";

const KEY = "alerts";

export function useAlerts(params?: {
  severity?: string;
  alert_type?: string;
  acknowledged?: boolean;
  page?: number;
  size?: number;
}) {
  return useQuery<Page<AlertRead>>({
    queryKey: [KEY, params],
    queryFn: async () => {
      const { data } = await api.get("/alerts", { params: { page: 1, size: 100, ...params } });
      return data;
    },
  });
}

export function useAlertSummary() {
  return useQuery<Record<string, number>>({
    queryKey: [KEY, "summary"],
    queryFn: async () => {
      const { data } = await api.get("/alerts/summary");
      return data;
    },
  });
}

export function useAcknowledgeAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(`/alerts/${id}/acknowledge`);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
