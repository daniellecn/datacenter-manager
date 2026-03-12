import { useQuery } from '@tanstack/react-query';
import api from './index';
import type {
  PhysicalTopologyResponse,
  NetworkTopologyResponse,
  FloorPlanResponse,
  RackElevationResponse,
  HopPathResponse,
  DatacenterOption,
} from '@/types/topology';
import type { DeviceRead } from '@/types';

// ─── Datacenter list (for selectors) ────────────────────────────────────────

export function useDatacenters() {
  return useQuery<DatacenterOption[]>({
    queryKey: ['datacenters'],
    queryFn: () =>
      api.get<{ items: DatacenterOption[] }>('/datacenters').then((r) => r.data.items),
  });
}

// ─── Physical topology ────────────────────────────────────────────────────────

export function usePhysicalTopology(datacenterId?: string) {
  return useQuery<PhysicalTopologyResponse>({
    queryKey: ['topology', 'physical', datacenterId],
    queryFn: () =>
      api
        .get<PhysicalTopologyResponse>('/topology/physical', {
          params: datacenterId ? { datacenter_id: datacenterId } : undefined,
        })
        .then((r) => r.data),
    staleTime: 60_000,
    enabled: true,
  });
}

// ─── Network topology ─────────────────────────────────────────────────────────

export function useNetworkTopology(options?: {
  datacenterId?: string;
  vlanId?: number;
}) {
  return useQuery<NetworkTopologyResponse>({
    queryKey: ['topology', 'network', options?.datacenterId, options?.vlanId],
    queryFn: () =>
      api
        .get<NetworkTopologyResponse>('/topology/network', {
          params: {
            ...(options?.datacenterId && { datacenter_id: options.datacenterId }),
            ...(options?.vlanId && { vlan_id: options.vlanId }),
          },
        })
        .then((r) => r.data),
    staleTime: 60_000,
  });
}

// ─── Datacenter floor plan ────────────────────────────────────────────────────

export function useFloorPlan(datacenterId?: string) {
  return useQuery<FloorPlanResponse>({
    queryKey: ['topology', 'floor-plan', datacenterId],
    queryFn: () =>
      api
        .get<FloorPlanResponse>(`/topology/floor-plan`, {
          params: { datacenter_id: datacenterId },
        })
        .then((r) => r.data),
    staleTime: 60_000,
    enabled: !!datacenterId,
  });
}

// ─── Rack elevation ───────────────────────────────────────────────────────────

export function useRackElevation(rackId?: string) {
  return useQuery<RackElevationResponse>({
    queryKey: ['topology', 'rack-elevation', rackId],
    queryFn: () =>
      api.get<RackElevationResponse>(`/racks/${rackId}/elevation`).then((r) => r.data),
    staleTime: 30_000,
    enabled: !!rackId,
  });
}

// ─── Chassis blades ───────────────────────────────────────────────────────────

export function useChassisBlades(chassisId?: string) {
  return useQuery<DeviceRead[]>({
    queryKey: ['devices', 'chassis-blades', chassisId],
    queryFn: () =>
      api
        .get<{ items: DeviceRead[] }>('/devices', {
          params: { blade_chassis_id: chassisId, size: 100, page: 1 },
        })
        .then((r) => r.data.items ?? []),
    enabled: !!chassisId,
    staleTime: 30_000,
  });
}

// ─── Hop-path trace ───────────────────────────────────────────────────────────

export function useHopPath(fromDeviceId?: string, toDeviceId?: string) {
  return useQuery<HopPathResponse>({
    queryKey: ['topology', 'hop-path', fromDeviceId, toDeviceId],
    queryFn: () =>
      api
        .get<HopPathResponse>('/topology/path', {
          params: { from: fromDeviceId, to: toDeviceId },
        })
        .then((r) => r.data),
    enabled: !!fromDeviceId && !!toDeviceId,
    staleTime: 10_000,
  });
}
