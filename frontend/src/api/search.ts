import { useQuery } from "@tanstack/react-query";
import api from "./index";

export interface SearchHit {
  entity_type: "device" | "rack" | "room" | "datacenter" | "ip_address" | "vm";
  entity_id: string;
  label: string;
  sublabel: string | null;
  extra: Record<string, unknown>;
}

export interface SearchResponse {
  query: string;
  total: number;
  results: SearchHit[];
}

export function useSearch(q: string) {
  return useQuery<SearchResponse>({
    queryKey: ["search", q],
    queryFn: () => api.get("/search", { params: { q } }).then((r) => r.data),
    enabled: q.trim().length > 0,
    staleTime: 30_000,
  });
}
