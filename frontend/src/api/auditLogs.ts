import { useQuery } from "@tanstack/react-query";
import api from "./index";
import type { AuditLogRead, Page } from "@/types";

const KEY = "audit-logs";

export function useAuditLogs(params?: {
  entity_type?: string;
  entity_id?: string;
  action?: string;
  page?: number;
  size?: number;
}) {
  return useQuery<Page<AuditLogRead>>({
    queryKey: [KEY, params],
    queryFn: async () => {
      const { data } = await api.get("/audit", { params: { page: 1, size: 50, ...params } });
      return data;
    },
  });
}
