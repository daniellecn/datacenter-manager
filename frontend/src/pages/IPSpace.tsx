import { useState } from "react";
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { useIPNetworks, useCreateIPNetwork, useUpdateIPNetwork, useDeleteIPNetwork } from "@/api/ipNetworks";
import { useIPAddresses, useCreateIPAddress, useDeleteIPAddress } from "@/api/ipAddresses";
import { useVLANs } from "@/api/vlans";
import { Table } from "@/components/common/Table";
import { Modal } from "@/components/common/Modal";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FormField, Input, Textarea, Select } from "@/components/common/FormField";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/Badge";
import type { IPNetworkRead, IPAddressRead } from "@/types";

const PURPOSES = ["management","production","storage","backup","dmz","oob","replication","vmotion"];
const IP_STATUS = ["in_use","available","reserved","deprecated"];
const ASSIGN_TYPES = ["static","dhcp","reserved","anycast"];

interface SubnetForm {
  cidr: string; name: string; gateway: string; vlan_id: string;
  purpose: string; dhcp_enabled: boolean; notes: string;
}
const emptySubnet: SubnetForm = { cidr: "", name: "", gateway: "", vlan_id: "", purpose: "", dhcp_enabled: false, notes: "" };

interface IPForm {
  address: string; subnet_id: string; fqdn: string;
  assignment_type: string; status: string; notes: string;
}

export default function IPSpace() {
  const [page, setPage] = useState(1);
  const { data: subnetsData, isLoading } = useIPNetworks({ page, size: 50 });
  const { data: vlansData } = useVLANs({ size: 200 });
  const vlanList = vlansData?.items ?? [];
  const vlanMap = Object.fromEntries(vlanList.map((v) => [v.id, `VLAN ${v.vlan_id} — ${v.name}`]));

  const createSubnetMut = useCreateIPNetwork();
  const deleteSubnetMut = useDeleteIPNetwork();

  const [subnetModal, setSubnetModal] = useState(false);
  const [editingSubnet, setEditingSubnet] = useState<IPNetworkRead | null>(null);
  const [subnetForm, setSubnetForm] = useState<SubnetForm>(emptySubnet);
  const [deleteSubnet, setDeleteSubnet] = useState<IPNetworkRead | null>(null);
  const [expandedSubnet, setExpandedSubnet] = useState<string | null>(null);
  const [error, setError] = useState("");
  const updateSubnetMut = useUpdateIPNetwork(editingSubnet?.id ?? "");

  // IP addresses for expanded subnet
  const { data: ipData } = useIPAddresses({ subnet_id: expandedSubnet ?? "", size: 200 });
  const createIPMut = useCreateIPAddress();
  const deleteIPMut = useDeleteIPAddress();
  const [ipModal, setIPModal] = useState(false);
  const [ipForm, setIPForm] = useState<IPForm>({ address: "", subnet_id: expandedSubnet ?? "", fqdn: "", assignment_type: "static", status: "in_use", notes: "" });

  function openCreateSubnet() { setEditingSubnet(null); setSubnetForm(emptySubnet); setError(""); setSubnetModal(true); }
  function openEditSubnet(s: IPNetworkRead) {
    setEditingSubnet(s);
    setSubnetForm({ cidr: s.cidr, name: s.name, gateway: s.gateway ?? "", vlan_id: s.vlan_id ?? "",
      purpose: s.purpose ?? "", dhcp_enabled: s.dhcp_enabled, notes: s.notes ?? "" });
    setError(""); setSubnetModal(true);
  }

  async function handleSaveSubnet() {
    setError("");
    if (!subnetForm.cidr || !subnetForm.name) { setError("CIDR and name are required."); return; }
    try {
      const body = { cidr: subnetForm.cidr, name: subnetForm.name, gateway: subnetForm.gateway || null,
        vlan_id: subnetForm.vlan_id || null, purpose: subnetForm.purpose || null,
        dhcp_enabled: subnetForm.dhcp_enabled, notes: subnetForm.notes || null };
      if (editingSubnet) await updateSubnetMut.mutateAsync(body);
      else await createSubnetMut.mutateAsync(body);
      setSubnetModal(false);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Save failed.");
    }
  }

  async function handleAddIP() {
    await createIPMut.mutateAsync({
      address: ipForm.address, subnet_id: expandedSubnet || null,
      fqdn: ipForm.fqdn || null, assignment_type: ipForm.assignment_type,
      status: ipForm.status, notes: ipForm.notes || null,
    });
    setIPModal(false);
    setIPForm({ address: "", subnet_id: expandedSubnet ?? "", fqdn: "", assignment_type: "static", status: "in_use", notes: "" });
  }

  const setSub = (k: keyof SubnetForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setSubnetForm((f) => ({ ...f, [k]: e.target.value }));
  const setIP = (k: keyof IPForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setIPForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">IP Space</h1>
        <button onClick={openCreateSubnet} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
          <Plus size={16} /> Add Subnet
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 w-8" />
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">CIDR</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Gateway</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">VLAN</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Purpose</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">DHCP</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={8} className="py-10 text-center text-gray-400">Loading…</td></tr>
            ) : (subnetsData?.items ?? []).map((subnet) => (
              <>
                <tr key={subnet.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <button onClick={() => setExpandedSubnet(expandedSubnet === subnet.id ? null : subnet.id)}
                      className="p-1 rounded hover:bg-gray-200 text-gray-400">
                      {expandedSubnet === subnet.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold text-blue-700">{subnet.cidr}</td>
                  <td className="px-4 py-3 text-gray-800">{subnet.name}</td>
                  <td className="px-4 py-3 font-mono text-gray-600">{subnet.gateway ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{subnet.vlan_id ? (vlanMap[subnet.vlan_id] ?? "—") : "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{subnet.purpose?.replace(/_/g, " ") ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${subnet.dhcp_enabled ? "text-green-600" : "text-gray-400"}`}>
                      {subnet.dhcp_enabled ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => openEditSubnet(subnet)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600"><Pencil size={14} /></button>
                      <button onClick={() => setDeleteSubnet(subnet)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
                {expandedSubnet === subnet.id && (
                  <tr key={`${subnet.id}-expanded`}>
                    <td colSpan={8} className="px-8 py-3 bg-blue-50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">IP Addresses in {subnet.cidr}</span>
                        <button onClick={() => { setIPForm((f) => ({ ...f, subnet_id: subnet.id })); setIPModal(true); }}
                          className="flex items-center gap-1 px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                          <Plus size={12} /> Add IP
                        </button>
                      </div>
                      <Table<IPAddressRead>
                        data={ipData?.items ?? []}
                        rowKey={(r) => r.id}
                        emptyMessage="No IP addresses assigned."
                        columns={[
                          { key: "address", header: "Address", render: (r) => <span className="font-mono">{r.address}</span> },
                          { key: "fqdn", header: "FQDN", render: (r) => r.fqdn ?? "—" },
                          { key: "assignment_type", header: "Assignment", render: (r) => r.assignment_type },
                          { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
                          { key: "actions", header: "", render: (r) => (
                            <button onClick={() => deleteIPMut.mutate(r.id)} className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-gray-100 text-xs">Remove</button>
                          )},
                        ]}
                      />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} size={50} total={subnetsData?.total ?? 0} onChange={setPage} />

      {/* Subnet Modal */}
      <Modal open={subnetModal} onClose={() => setSubnetModal(false)} title={editingSubnet ? "Edit Subnet" : "New Subnet"}>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="CIDR" required><Input value={subnetForm.cidr} onChange={setSub("cidr")} placeholder="10.0.0.0/24" disabled={!!editingSubnet} /></FormField>
            <FormField label="Name" required><Input value={subnetForm.name} onChange={setSub("name")} /></FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Gateway"><Input value={subnetForm.gateway} onChange={setSub("gateway")} /></FormField>
            <FormField label="VLAN">
              <Select value={subnetForm.vlan_id} onChange={setSub("vlan_id")}>
                <option value="">None</option>
                {vlanList.map((v) => <option key={v.id} value={v.id}>VLAN {v.vlan_id} — {v.name}</option>)}
              </Select>
            </FormField>
          </div>
          <FormField label="Purpose">
            <Select value={subnetForm.purpose} onChange={setSub("purpose")}>
              <option value="">None</option>
              {PURPOSES.map((p) => <option key={p} value={p}>{p.replace(/_/g, " ")}</option>)}
            </Select>
          </FormField>
          <FormField label="Notes"><Textarea value={subnetForm.notes} onChange={setSub("notes")} /></FormField>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setSubnetModal(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={handleSaveSubnet} disabled={createSubnetMut.isPending || updateSubnetMut.isPending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
              {editingSubnet ? "Save" : "Create"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Add IP Modal */}
      <Modal open={ipModal} onClose={() => setIPModal(false)} title="Add IP Address" size="sm">
        <div className="space-y-3">
          <FormField label="IP Address" required><Input value={ipForm.address} onChange={setIP("address")} placeholder="10.0.0.10" /></FormField>
          <FormField label="FQDN"><Input value={ipForm.fqdn} onChange={setIP("fqdn")} /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Assignment">
              <Select value={ipForm.assignment_type} onChange={setIP("assignment_type")}>
                {ASSIGN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </FormField>
            <FormField label="Status">
              <Select value={ipForm.status} onChange={setIP("status")}>
                {IP_STATUS.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
              </Select>
            </FormField>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setIPModal(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={handleAddIP} disabled={createIPMut.isPending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">Add</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteSubnet}
        onConfirm={async () => { await deleteSubnetMut.mutateAsync(deleteSubnet!.id); setDeleteSubnet(null); }}
        onCancel={() => setDeleteSubnet(null)}
        title="Delete Subnet" description={`Delete subnet ${deleteSubnet?.cidr}?`} confirmLabel="Delete" danger />
    </div>
  );
}
