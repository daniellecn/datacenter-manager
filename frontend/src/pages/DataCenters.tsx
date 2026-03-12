import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useDataCenters, useCreateDataCenter, useUpdateDataCenter, useDeleteDataCenter } from "@/api/datacenters";
import { Table } from "@/components/common/Table";
import { Modal } from "@/components/common/Modal";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FormField, Input, Textarea } from "@/components/common/FormField";
import { Pagination } from "@/components/common/Pagination";
import type { DataCenterRead } from "@/types";

interface FormData {
  name: string; address: string; city: string; country: string;
  total_power_kw: string; total_cooling_kw: string; pue: string; notes: string;
}

const empty: FormData = { name: "", address: "", city: "", country: "", total_power_kw: "", total_cooling_kw: "", pue: "", notes: "" };

function toBody(f: FormData) {
  return {
    name: f.name,
    address: f.address || null,
    city: f.city || null,
    country: f.country || null,
    total_power_kw: f.total_power_kw ? parseFloat(f.total_power_kw) : null,
    total_cooling_kw: f.total_cooling_kw ? parseFloat(f.total_cooling_kw) : null,
    pue: f.pue ? parseFloat(f.pue) : null,
    notes: f.notes || null,
  };
}

export default function DataCenters() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useDataCenters(page, 50);
  const createMut = useCreateDataCenter();
  const deleteMut = useDeleteDataCenter();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DataCenterRead | null>(null);
  const [form, setForm] = useState<FormData>(empty);
  const [deleteTarget, setDeleteTarget] = useState<DataCenterRead | null>(null);
  const [error, setError] = useState("");

  const updateMut = useUpdateDataCenter(editing?.id ?? "");

  function openCreate() { setEditing(null); setForm(empty); setError(""); setModalOpen(true); }
  function openEdit(dc: DataCenterRead) {
    setEditing(dc);
    setForm({
      name: dc.name, address: dc.address ?? "", city: dc.city ?? "",
      country: dc.country ?? "", total_power_kw: dc.total_power_kw ?? "",
      total_cooling_kw: dc.total_cooling_kw ?? "", pue: dc.pue ?? "", notes: dc.notes ?? "",
    });
    setError("");
    setModalOpen(true);
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

  async function handleDelete() {
    if (!deleteTarget) return;
    await deleteMut.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  }

  const set = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Data Centers</h1>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
          <Plus size={16} /> Add Data Center
        </button>
      </div>

      <Table<DataCenterRead>
        loading={isLoading}
        data={data?.items ?? []}
        rowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/rooms?datacenter_id=${r.id}`)}
        columns={[
          { key: "name", header: "Name" },
          { key: "city", header: "City", render: (r) => r.city ?? "—" },
          { key: "country", header: "Country", render: (r) => r.country ?? "—" },
          { key: "total_power_kw", header: "Power (kW)", render: (r) => r.total_power_kw ?? "—" },
          { key: "pue", header: "PUE", render: (r) => r.pue ?? "—" },
          {
            key: "actions", header: "",
            render: (r) => (
              <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => openEdit(r)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600"><Pencil size={14} /></button>
                <button onClick={() => setDeleteTarget(r)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            ),
          },
        ]}
      />
      <Pagination page={page} size={50} total={data?.total ?? 0} onChange={setPage} />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Data Center" : "New Data Center"}>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-500">{error}</p>}
          <FormField label="Name" required><Input value={form.name} onChange={set("name")} /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="City"><Input value={form.city} onChange={set("city")} /></FormField>
            <FormField label="Country"><Input value={form.country} onChange={set("country")} /></FormField>
          </div>
          <FormField label="Address"><Input value={form.address} onChange={set("address")} /></FormField>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Power (kW)"><Input type="number" value={form.total_power_kw} onChange={set("total_power_kw")} /></FormField>
            <FormField label="Cooling (kW)"><Input type="number" value={form.total_cooling_kw} onChange={set("total_cooling_kw")} /></FormField>
            <FormField label="PUE"><Input type="number" step="0.01" value={form.pue} onChange={set("pue")} /></FormField>
          </div>
          <FormField label="Notes"><Textarea value={form.notes} onChange={set("notes")} /></FormField>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
              {editing ? "Save Changes" : "Create"}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        title="Delete Data Center"
        description={`Delete "${deleteTarget?.name}"? This will also remove all rooms and racks within it.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
