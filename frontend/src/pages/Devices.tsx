import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Pencil, Trash2, ExternalLink } from "lucide-react";
import { useDevices, useCreateDevice, useUpdateDevice, useDeleteDevice } from "@/api/devices";
import { useRacks } from "@/api/racks";
import { Table } from "@/components/common/Table";
import { Modal } from "@/components/common/Modal";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FormField, Input, Textarea, Select } from "@/components/common/FormField";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/Badge";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import type { DeviceRead } from "@/types";

const DEVICE_TYPES = ["server","switch","router","firewall","storage","pdu","patch_panel","kvm","load_balancer","cable_manager","other"];
const DEVICE_STATUS = ["active","inactive","maintenance","decommissioned","spare"];
const MGMT_PROTO = ["ipmi","idrac","ilo","xcc","snmp","ssh","api"];

interface FormData {
  rack_id: string; name: string; device_type: string; manufacturer: string; model: string;
  part_number: string; serial_number: string; asset_tag: string;
  rack_unit_start: string; rack_unit_size: string; face: string;
  power_rated_w: string; status: string; management_ip: string;
  management_protocol: string; ssh_username: string; ssh_password: string;
  warranty_expiry: string; end_of_life_date: string; notes: string;
}
function emptyForm(rackId: string): FormData {
  return { rack_id: rackId, name: "", device_type: "server", manufacturer: "", model: "",
    part_number: "", serial_number: "", asset_tag: "",
    rack_unit_start: "", rack_unit_size: "1", face: "front",
    power_rated_w: "", status: "active", management_ip: "",
    management_protocol: "", ssh_username: "", ssh_password: "",
    warranty_expiry: "", end_of_life_date: "", notes: "" };
}

export default function Devices() {
  const [searchParams] = useSearchParams();
  const rackFilter = searchParams.get("rack_id") ?? undefined;
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("");

  const params: Record<string, unknown> = { page, size: 50 };
  if (rackFilter) params.rack_id = rackFilter;
  if (typeFilter) params.device_type = typeFilter;

  const { data, isLoading } = useDevices(params);
  const { data: rackData } = useRacks({ page: 1, size: 200 });
  const rackList = rackData?.items ?? [];
  const rackMap = Object.fromEntries(rackList.map((r) => [r.id, r.name]));

  const createMut = useCreateDevice();
  const deleteMut = useDeleteDevice();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DeviceRead | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm(rackFilter ?? ""));
  const [deleteTarget, setDeleteTarget] = useState<DeviceRead | null>(null);
  const [error, setError] = useState("");
  const updateMut = useUpdateDevice(editing?.id ?? "");

  function openCreate() { setEditing(null); setForm(emptyForm(rackFilter ?? "")); setError(""); setModalOpen(true); }
  function openEdit(d: DeviceRead) {
    setEditing(d);
    setForm({ rack_id: d.rack_id ?? "", name: d.name, device_type: d.device_type,
      manufacturer: d.manufacturer ?? "", model: d.model ?? "",
      part_number: d.part_number ?? "", serial_number: d.serial_number ?? "",
      asset_tag: d.asset_tag ?? "", rack_unit_start: d.rack_unit_start?.toString() ?? "",
      rack_unit_size: d.rack_unit_size?.toString() ?? "1", face: d.face ?? "front",
      power_rated_w: d.power_rated_w?.toString() ?? "", status: d.status,
      management_ip: d.management_ip ?? "", management_protocol: d.management_protocol ?? "",
      ssh_username: d.ssh_username ?? "", ssh_password: "",
      warranty_expiry: d.warranty_expiry ?? "", end_of_life_date: d.end_of_life_date ?? "",
      notes: d.notes ?? "" });
    setError(""); setModalOpen(true);
  }

  function toBody(f: FormData) {
    return {
      rack_id: f.rack_id || null, name: f.name, device_type: f.device_type,
      manufacturer: f.manufacturer || null, model: f.model || null,
      part_number: f.part_number || null, serial_number: f.serial_number || null,
      asset_tag: f.asset_tag || null,
      rack_unit_start: f.rack_unit_start ? parseInt(f.rack_unit_start) : null,
      rack_unit_size: f.rack_unit_size ? parseInt(f.rack_unit_size) : null,
      face: f.face || null,
      power_rated_w: f.power_rated_w ? parseInt(f.power_rated_w) : null,
      status: f.status, management_ip: f.management_ip || null,
      management_protocol: f.management_protocol || null,
      ssh_username: f.ssh_username || null,
      ssh_password: f.ssh_password || undefined,
      warranty_expiry: f.warranty_expiry || null, end_of_life_date: f.end_of_life_date || null,
      notes: f.notes || null,
    };
  }

  async function handleSave() {
    setError("");
    if (!form.name.trim()) { setError("Name is required."); return; }
    try {
      if (editing) await updateMut.mutateAsync(toBody(form));
      else await createMut.mutateAsync(toBody(form));
      setModalOpen(false);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Save failed.");
    }
  }

  const set = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const rackName = rackFilter ? rackMap[rackFilter] : null;

  return (
    <div className="space-y-4">
      <Breadcrumbs crumbs={rackName
        ? [{ label: "Racks", to: "/racks" }, { label: rackName }, { label: "Devices" }]
        : [{ label: "Devices" }]} />
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Devices</h1>
        <div className="flex items-center gap-3">
          <Select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="text-sm">
            <option value="">All types</option>
            {DEVICE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
          </Select>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
            <Plus size={16} /> Add Device
          </button>
        </div>
      </div>

      <Table<DeviceRead>
        loading={isLoading}
        data={data?.items ?? []}
        rowKey={(r) => r.id}
        columns={[
          { key: "name", header: "Name", render: (r) => (
            <button onClick={() => navigate(`/devices/${r.id}`)} className="text-blue-600 hover:underline font-medium flex items-center gap-1">
              {r.name} <ExternalLink size={12} />
            </button>
          )},
          { key: "device_type", header: "Type", render: (r) => r.device_type.replace(/_/g, " ") },
          { key: "manufacturer", header: "Manufacturer", render: (r) => [r.manufacturer, r.model].filter(Boolean).join(" ") || "—" },
          { key: "rack", header: "Rack", render: (r) => r.rack_id ? (rackMap[r.rack_id] ?? "—") : "—" },
          { key: "rack_unit_start", header: "U", render: (r) => r.rack_unit_start?.toString() ?? "—" },
          { key: "management_ip", header: "Mgmt IP", render: (r) => r.management_ip ?? "—" },
          { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
          {
            key: "actions", header: "",
            render: (r) => (
              <div className="flex gap-1 justify-end">
                <button onClick={(e) => { e.stopPropagation(); openEdit(r); }} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600"><Pencil size={14} /></button>
                <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(r); }} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            ),
          },
        ]}
      />
      <Pagination page={page} size={50} total={data?.total ?? 0} onChange={setPage} />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Device" : "New Device"} size="xl">
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Name" required><Input value={form.name} onChange={set("name")} /></FormField>
            <FormField label="Device Type" required>
              <Select value={form.device_type} onChange={set("device_type")}>
                {DEVICE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </Select>
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Manufacturer"><Input value={form.manufacturer} onChange={set("manufacturer")} /></FormField>
            <FormField label="Model"><Input value={form.model} onChange={set("model")} /></FormField>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Serial Number"><Input value={form.serial_number} onChange={set("serial_number")} /></FormField>
            <FormField label="Part Number"><Input value={form.part_number} onChange={set("part_number")} /></FormField>
            <FormField label="Asset Tag"><Input value={form.asset_tag} onChange={set("asset_tag")} /></FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Rack">
              <Select value={form.rack_id} onChange={set("rack_id")}>
                <option value="">None</option>
                {rackList.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </FormField>
            <div className="grid grid-cols-3 gap-2">
              <FormField label="Unit Start"><Input type="number" value={form.rack_unit_start} onChange={set("rack_unit_start")} /></FormField>
              <FormField label="U Size"><Input type="number" value={form.rack_unit_size} onChange={set("rack_unit_size")} /></FormField>
              <FormField label="Face">
                <Select value={form.face} onChange={set("face")}>
                  <option value="front">Front</option><option value="rear">Rear</option>
                </Select>
              </FormField>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Power (W)"><Input type="number" value={form.power_rated_w} onChange={set("power_rated_w")} /></FormField>
            <FormField label="Status">
              <Select value={form.status} onChange={set("status")}>
                {DEVICE_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </FormField>
            <FormField label="Mgmt Protocol">
              <Select value={form.management_protocol} onChange={set("management_protocol")}>
                <option value="">None</option>
                {MGMT_PROTO.map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}
              </Select>
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Management IP"><Input value={form.management_ip} onChange={set("management_ip")} placeholder="192.168.1.100" /></FormField>
            <FormField label="SSH Username"><Input value={form.ssh_username} onChange={set("ssh_username")} /></FormField>
          </div>
          <FormField label="SSH Password (leave blank to keep existing)">
            <Input type="password" value={form.ssh_password} onChange={set("ssh_password")} autoComplete="new-password" />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Warranty Expiry"><Input type="date" value={form.warranty_expiry} onChange={set("warranty_expiry")} /></FormField>
            <FormField label="End of Life"><Input type="date" value={form.end_of_life_date} onChange={set("end_of_life_date")} /></FormField>
          </div>
          <FormField label="Notes"><Textarea value={form.notes} onChange={set("notes")} /></FormField>
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 mt-4">
          <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
            {editing ? "Save Changes" : "Create"}
          </button>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteTarget}
        onConfirm={async () => { await deleteMut.mutateAsync(deleteTarget!.id); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
        title="Delete Device"
        description={`"${deleteTarget?.name}" will be marked inactive (soft delete). Data is preserved.`}
        confirmLabel="Delete" danger />
    </div>
  );
}
