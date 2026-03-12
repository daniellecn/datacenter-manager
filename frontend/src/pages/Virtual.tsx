import { useState } from "react";
import { ChevronRight, Plus, Trash2, Pencil, Server } from "lucide-react";
import { useVirtClusters, useCreateVirtCluster, useUpdateVirtCluster, useDeleteVirtCluster,
  useVirtHosts, useCreateVirtHost, useDeleteVirtHost,
  useVMs, useCreateVM, useDeleteVM } from "@/api/virtual";
import { useDevices } from "@/api/devices";
import { Table } from "@/components/common/Table";
import { Modal } from "@/components/common/Modal";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FormField, Input, Textarea, Select } from "@/components/common/FormField";
import { StatusBadge } from "@/components/common/Badge";
import { Spinner } from "@/components/common/Spinner";
import { formatDateTime } from "@/lib/utils";
import type { VirtClusterRead, VirtHostRead, VMRead } from "@/types";

const PLATFORMS = ["vmware_vsphere","hyper_v","proxmox","citrix_xenserver","xcp_ng"];
const VM_STATUS = ["running","stopped","suspended","migrating","error"];
const OS_TYPES = ["windows","linux","freebsd","other"];

interface ClusterForm {
  name: string; platform: string; management_url: string;
  management_username: string; management_password: string;
  ha_enabled: boolean; drs_enabled: boolean; notes: string;
}
const emptyCluster: ClusterForm = { name: "", platform: "vmware_vsphere", management_url: "",
  management_username: "", management_password: "", ha_enabled: false, drs_enabled: false, notes: "" };

interface VMForm {
  host_id: string; name: string; status: string; os_type: string;
  vcpu_count: string; ram_gb: string; storage_gb: string; notes: string;
}

export default function Virtual() {
  const { data: clustersData, isLoading } = useVirtClusters();
  const createClusterMut = useCreateVirtCluster();
  const deleteClusterMut = useDeleteVirtCluster();

  const [selectedCluster, setSelectedCluster] = useState<VirtClusterRead | null>(null);
  const [selectedHost, setSelectedHost] = useState<VirtHostRead | null>(null);

  const { data: hostsData } = useVirtHosts({ cluster_id: selectedCluster?.id });
  const { data: vmsData } = useVMs({ host_id: selectedHost?.id });

  const { data: devicesData } = useDevices({ size: 500 });
  const deviceList = devicesData?.items ?? [];
  const deviceMap = Object.fromEntries(deviceList.map((d) => [d.id, d.name]));

  const createHostMut = useCreateVirtHost();
  const deleteHostMut = useDeleteVirtHost();
  const createVMMut = useCreateVM();
  const deleteVMMut = useDeleteVM();

  const [clusterModalOpen, setClusterModalOpen] = useState(false);
  const [editingCluster, setEditingCluster] = useState<VirtClusterRead | null>(null);
  const [clusterForm, setClusterForm] = useState<ClusterForm>(emptyCluster);
  const updateClusterMut = useUpdateVirtCluster(editingCluster?.id ?? "");

  const [hostModalOpen, setHostModalOpen] = useState(false);
  const [hostForm, setHostForm] = useState({ device_id: "", cluster_id: selectedCluster?.id ?? "" });

  const [vmModalOpen, setVMModalOpen] = useState(false);
  const [vmForm, setVMForm] = useState<VMForm>({ host_id: selectedHost?.id ?? "", name: "", status: "stopped",
    os_type: "linux", vcpu_count: "", ram_gb: "", storage_gb: "", notes: "" });

  const [deleteCluster, setDeleteCluster] = useState<VirtClusterRead | null>(null);
  const [deleteHost, setDeleteHost] = useState<VirtHostRead | null>(null);
  const [deleteVM, setDeleteVM] = useState<VMRead | null>(null);
  const [error, setError] = useState("");

  async function handleSaveCluster() {
    setError("");
    if (!clusterForm.name) { setError("Name is required."); return; }
    try {
      const body = { name: clusterForm.name, platform: clusterForm.platform,
        management_url: clusterForm.management_url || null,
        management_username: clusterForm.management_username || null,
        management_password: clusterForm.management_password || undefined,
        ha_enabled: clusterForm.ha_enabled, drs_enabled: clusterForm.drs_enabled,
        notes: clusterForm.notes || null };
      if (editingCluster) await updateClusterMut.mutateAsync(body);
      else await createClusterMut.mutateAsync(body);
      setClusterModalOpen(false);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Save failed.");
    }
  }

  async function handleSaveHost() {
    setError("");
    if (!selectedCluster) return;
    try {
      await createHostMut.mutateAsync({ cluster_id: selectedCluster.id, device_id: hostForm.device_id || null });
      setHostModalOpen(false);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Save failed.");
    }
  }

  async function handleSaveVM() {
    setError("");
    if (!selectedHost || !vmForm.name) { setError("Host and VM name are required."); return; }
    try {
      await createVMMut.mutateAsync({
        host_id: selectedHost.id, name: vmForm.name, status: vmForm.status,
        os_type: vmForm.os_type || null,
        vcpu_count: vmForm.vcpu_count ? parseInt(vmForm.vcpu_count) : null,
        ram_gb: vmForm.ram_gb ? parseInt(vmForm.ram_gb) : null,
        storage_gb: vmForm.storage_gb ? parseInt(vmForm.storage_gb) : null,
        notes: vmForm.notes || null,
      });
      setVMModalOpen(false);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Save failed.");
    }
  }

  const setCluster = (k: keyof ClusterForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setClusterForm((f) => ({ ...f, [k]: e.target.value }));
  const setVM = (k: keyof VMForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setVMForm((f) => ({ ...f, [k]: e.target.value }));

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Virtual Infrastructure</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* Clusters panel */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800 text-sm">Clusters</h2>
            <button onClick={() => { setEditingCluster(null); setClusterForm(emptyCluster); setError(""); setClusterModalOpen(true); }}
              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600"><Plus size={15} /></button>
          </div>
          <div className="divide-y divide-gray-50">
            {(clustersData?.items ?? []).map((c) => (
              <div key={c.id}
                onClick={() => { setSelectedCluster(c); setSelectedHost(null); }}
                className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-blue-50 ${selectedCluster?.id === c.id ? "bg-blue-50" : ""}`}>
                <div className="min-w-0">
                  <p className="font-medium text-sm text-gray-900 truncate">{c.name}</p>
                  <p className="text-xs text-gray-400">{c.platform.replace(/_/g, " ")}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); setEditingCluster(c); setClusterForm({ name: c.name, platform: c.platform, management_url: c.management_url ?? "", management_username: c.management_username ?? "", management_password: "", ha_enabled: c.ha_enabled, drs_enabled: c.drs_enabled, notes: c.notes ?? "" }); setClusterModalOpen(true); }}
                    className="p-1 rounded hover:bg-gray-100 text-gray-400"><Pencil size={12} /></button>
                  <button onClick={(e) => { e.stopPropagation(); setDeleteCluster(c); }}
                    className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"><Trash2 size={12} /></button>
                  <ChevronRight size={14} className="text-gray-300" />
                </div>
              </div>
            ))}
            {(clustersData?.items ?? []).length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-gray-400">No clusters.</p>
            )}
          </div>
        </div>

        {/* Hosts panel */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800 text-sm">
              Hosts {selectedCluster && <span className="text-gray-400 font-normal">— {selectedCluster.name}</span>}
            </h2>
            {selectedCluster && (
              <button onClick={() => { setHostForm({ device_id: "", cluster_id: selectedCluster.id }); setError(""); setHostModalOpen(true); }}
                className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600"><Plus size={15} /></button>
            )}
          </div>
          <div className="divide-y divide-gray-50">
            {!selectedCluster ? (
              <p className="px-4 py-6 text-center text-sm text-gray-400">Select a cluster.</p>
            ) : (hostsData?.items ?? []).map((h) => (
              <div key={h.id}
                onClick={() => { setSelectedHost(h); setVMForm((f) => ({ ...f, host_id: h.id })); }}
                className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-blue-50 ${selectedHost?.id === h.id ? "bg-blue-50" : ""}`}>
                <div className="min-w-0">
                  <p className="font-medium text-sm text-gray-900 truncate">
                    {h.device_id ? (deviceMap[h.device_id] ?? "Host") : "Unlinked Host"}
                  </p>
                  <p className="text-xs text-gray-400">{h.is_in_maintenance ? "In Maintenance" : "Online"} · {h.vcpu_allocated ?? "?"} vCPU</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); setDeleteHost(h); }}
                    className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"><Trash2 size={12} /></button>
                  <ChevronRight size={14} className="text-gray-300" />
                </div>
              </div>
            ))}
            {selectedCluster && (hostsData?.items ?? []).length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-gray-400">No hosts in this cluster.</p>
            )}
          </div>
        </div>

        {/* VMs panel */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800 text-sm">
              VMs {selectedHost && <span className="text-gray-400 font-normal">— {deviceMap[selectedHost.device_id ?? ""] ?? "Host"}</span>}
            </h2>
            {selectedHost && (
              <button onClick={() => { setVMForm((f) => ({ ...f, host_id: selectedHost.id })); setError(""); setVMModalOpen(true); }}
                className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600"><Plus size={15} /></button>
            )}
          </div>
          <div className="divide-y divide-gray-50">
            {!selectedHost ? (
              <p className="px-4 py-6 text-center text-sm text-gray-400">Select a host.</p>
            ) : (vmsData?.items ?? []).map((vm) => (
              <div key={vm.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm text-gray-900 truncate flex items-center gap-1.5">
                    <Server size={12} className="text-gray-400 shrink-0" /> {vm.name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <StatusBadge status={vm.status} />
                    <span className="text-xs text-gray-400">{vm.vcpu_count ?? "?"} vCPU · {vm.ram_gb ?? "?"}GB RAM</span>
                  </div>
                </div>
                <button onClick={() => setDeleteVM(vm)} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500 shrink-0"><Trash2 size={12} /></button>
              </div>
            ))}
            {selectedHost && (vmsData?.items ?? []).length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-gray-400">No VMs on this host.</p>
            )}
          </div>
        </div>
      </div>

      {/* VM list at bottom */}
      {selectedCluster && !selectedHost && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-3">All VMs in {selectedCluster.name}</h2>
          <AllVMsTable clusterId={selectedCluster.id} />
        </div>
      )}

      {/* Cluster Modal */}
      <Modal open={clusterModalOpen} onClose={() => setClusterModalOpen(false)} title={editingCluster ? "Edit Cluster" : "New Cluster"}>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Name" required><Input value={clusterForm.name} onChange={setCluster("name")} /></FormField>
            <FormField label="Platform">
              <Select value={clusterForm.platform} onChange={setCluster("platform")}>
                {PLATFORMS.map((p) => <option key={p} value={p}>{p.replace(/_/g, " ")}</option>)}
              </Select>
            </FormField>
          </div>
          <FormField label="Management URL"><Input value={clusterForm.management_url} onChange={setCluster("management_url")} placeholder="https://vcenter.local" /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Username"><Input value={clusterForm.management_username} onChange={setCluster("management_username")} /></FormField>
            <FormField label="Password"><Input type="password" value={clusterForm.management_password} onChange={setCluster("management_password")} autoComplete="new-password" /></FormField>
          </div>
          <FormField label="Notes"><Textarea value={clusterForm.notes} onChange={setCluster("notes")} /></FormField>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setClusterModalOpen(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={handleSaveCluster} disabled={createClusterMut.isPending || updateClusterMut.isPending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
              {editingCluster ? "Save" : "Create"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Add Host Modal */}
      <Modal open={hostModalOpen} onClose={() => setHostModalOpen(false)} title="Add Host" size="sm">
        <div className="space-y-3">
          {error && <p className="text-sm text-red-500">{error}</p>}
          <FormField label="Physical Device (optional)">
            <Select value={hostForm.device_id} onChange={(e) => setHostForm((f) => ({ ...f, device_id: e.target.value }))}>
              <option value="">None</option>
              {deviceList.filter((d) => d.device_type === "server").map((d) =>
                <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </FormField>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setHostModalOpen(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={handleSaveHost} disabled={createHostMut.isPending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">Add</button>
          </div>
        </div>
      </Modal>

      {/* Add VM Modal */}
      <Modal open={vmModalOpen} onClose={() => setVMModalOpen(false)} title="Add VM">
        <div className="space-y-3">
          {error && <p className="text-sm text-red-500">{error}</p>}
          <FormField label="VM Name" required><Input value={vmForm.name} onChange={setVM("name")} /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Status">
              <Select value={vmForm.status} onChange={setVM("status")}>
                {VM_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </FormField>
            <FormField label="OS Type">
              <Select value={vmForm.os_type} onChange={setVM("os_type")}>
                {OS_TYPES.map((o) => <option key={o} value={o}>{o}</option>)}
              </Select>
            </FormField>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="vCPU"><Input type="number" value={vmForm.vcpu_count} onChange={setVM("vcpu_count")} /></FormField>
            <FormField label="RAM (GB)"><Input type="number" value={vmForm.ram_gb} onChange={setVM("ram_gb")} /></FormField>
            <FormField label="Storage (GB)"><Input type="number" value={vmForm.storage_gb} onChange={setVM("storage_gb")} /></FormField>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setVMModalOpen(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={handleSaveVM} disabled={createVMMut.isPending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">Create</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteCluster} onConfirm={async () => { await deleteClusterMut.mutateAsync(deleteCluster!.id); setDeleteCluster(null); if (selectedCluster?.id === deleteCluster?.id) setSelectedCluster(null); }}
        onCancel={() => setDeleteCluster(null)} title="Delete Cluster" description={`Delete cluster "${deleteCluster?.name}"?`} confirmLabel="Delete" danger />
      <ConfirmDialog open={!!deleteHost} onConfirm={async () => { await deleteHostMut.mutateAsync(deleteHost!.id); setDeleteHost(null); if (selectedHost?.id === deleteHost?.id) setSelectedHost(null); }}
        onCancel={() => setDeleteHost(null)} title="Delete Host" description="Delete this virtualization host?" confirmLabel="Delete" danger />
      <ConfirmDialog open={!!deleteVM} onConfirm={async () => { await deleteVMMut.mutateAsync(deleteVM!.id); setDeleteVM(null); }}
        onCancel={() => setDeleteVM(null)} title="Delete VM" description={`Delete VM "${deleteVM?.name}"?`} confirmLabel="Delete" danger />
    </div>
  );
}

function AllVMsTable({ clusterId }: { clusterId: string }) {
  const { data: vmsData } = useVMs({ cluster_id: clusterId, size: 200 });

  return (
    <Table<VMRead>
      data={vmsData?.items ?? []}
      rowKey={(r) => r.id}
      emptyMessage="No VMs."
      columns={[
        { key: "name", header: "Name" },
        { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
        { key: "os_type", header: "OS", render: (r) => r.os_type ?? "—" },
        { key: "vcpu_count", header: "vCPU", render: (r) => r.vcpu_count?.toString() ?? "—" },
        { key: "ram_gb", header: "RAM (GB)", render: (r) => r.ram_gb?.toString() ?? "—" },
        { key: "last_seen_at", header: "Last Seen", render: (r) => formatDateTime(r.last_seen_at) },
      ]}
    />
  );
}
