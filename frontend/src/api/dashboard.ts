import { useQuery } from "@tanstack/react-query";
import api from "./index";
import type { DashboardSummary } from "@/types";

export function useDashboardSummary() {
  return useQuery<DashboardSummary>({
    queryKey: ["dashboard", "summary"],
    queryFn: async () => {
      const { data } = await api.get("/dashboard/summary");
      return data;
    },
    refetchInterval: 60_000,
  });
}

export function useDashboardAlerts() {
  return useQuery({
    queryKey: ["dashboard", "alerts"],
    queryFn: async () => {
      const { data } = await api.get("/dashboard/alerts");
      return data;
    },
    refetchInterval: 60_000,
  });
}

export function useDashboardCapacity() {
  return useQuery({
    queryKey: ["dashboard", "capacity"],
    queryFn: async () => {
      const { data } = await api.get("/dashboard/capacity");
      return data;
    },
  });
}
