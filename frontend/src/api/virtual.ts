import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "./index";
import type { DatastoreRead, Page, VirtClusterRead, VirtHostRead, VMRead } from "@/types";

// ─── Clusters ─────────────────────────────────────────────────────────────

const CLUSTER_KEY = "virt-clusters";

export function useVirtClusters(params?: { page?: number; size?: number }) {
  return useQuery<Page<VirtClusterRead>>({
    queryKey: [CLUSTER_KEY, params],
    queryFn: async () => {
      const { data } = await api.get("/virt/clusters", { params: { page: 1, size: 100, ...params } });
      return data;
    },
  });
}

export function useVirtCluster(id: string) {
  return useQuery<VirtClusterRead>({
    queryKey: [CLUSTER_KEY, id],
    queryFn: async () => {
      const { data } = await api.get(`/virt/clusters/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateVirtCluster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.post("/virt/clusters", body);
      return data as VirtClusterRead;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [CLUSTER_KEY] }),
  });
}

export function useUpdateVirtCluster(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.patch(`/virt/clusters/${id}`, body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [CLUSTER_KEY] }),
  });
}

export function useDeleteVirtCluster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/virt/clusters/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [CLUSTER_KEY] }),
  });
}

// ─── Hosts ─────────────────────────────────────────────────────────────────

const HOST_KEY = "virt-hosts";

export function useVirtHosts(params?: { cluster_id?: string; page?: number; size?: number }) {
  return useQuery<Page<VirtHostRead>>({
    queryKey: [HOST_KEY, params],
    queryFn: async () => {
      const { data } = await api.get("/virt/hosts", { params: { page: 1, size: 200, ...params } });
      return data;
    },
  });
}

export function useVirtHost(id: string) {
  return useQuery<VirtHostRead>({
    queryKey: [HOST_KEY, id],
    queryFn: async () => {
      const { data } = await api.get(`/virt/hosts/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateVirtHost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.post("/virt/hosts", body);
      return data as VirtHostRead;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [HOST_KEY] }),
  });
}

export function useUpdateVirtHost(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.patch(`/virt/hosts/${id}`, body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [HOST_KEY] }),
  });
}

export function useDeleteVirtHost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/virt/hosts/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [HOST_KEY] }),
  });
}

// ─── VMs ───────────────────────────────────────────────────────────────────

const VM_KEY = "virt-vms";

export function useVMs(params?: { host_id?: string; cluster_id?: string; page?: number; size?: number }) {
  return useQuery<Page<VMRead>>({
    queryKey: [VM_KEY, params],
    queryFn: async () => {
      const { data } = await api.get("/virt/vms", { params: { page: 1, size: 200, ...params } });
      return data;
    },
  });
}

export function useVM(id: string) {
  return useQuery<VMRead>({
    queryKey: [VM_KEY, id],
    queryFn: async () => {
      const { data } = await api.get(`/virt/vms/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateVM() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.post("/virt/vms", body);
      return data as VMRead;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [VM_KEY] }),
  });
}

export function useUpdateVM(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.patch(`/virt/vms/${id}`, body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [VM_KEY] }),
  });
}

export function useDeleteVM() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/virt/vms/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [VM_KEY] }),
  });
}

// ─── Datastores ────────────────────────────────────────────────────────────

const DS_KEY = "datastores";

export function useDatastores(params?: { cluster_id?: string; page?: number; size?: number }) {
  return useQuery<Page<DatastoreRead>>({
    queryKey: [DS_KEY, params],
    queryFn: async () => {
      const { data } = await api.get("/virt/datastores", { params: { page: 1, size: 100, ...params } });
      return data;
    },
  });
}

export function useCreateDatastore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.post("/virt/datastores", body);
      return data as DatastoreRead;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [DS_KEY] }),
  });
}

export function useDeleteDatastore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/virt/datastores/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [DS_KEY] }),
  });
}
