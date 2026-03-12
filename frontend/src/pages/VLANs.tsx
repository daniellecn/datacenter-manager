import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useVLANs, useCreateVLAN, useUpdateVLAN, useDeleteVLAN } from "@/api/vlans";
import { Table } from "@/components/common/Table";
import { Modal } from "@/components/common/Modal";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FormField, Input } from "@/components/common/FormField";
import { Pagination } from "@/components/common/Pagination";
import type { VLANRead } from "@/types";

interface FormData { vlan_id: string; name: string; description: string; color: string; }
const emptyForm: FormData = { vlan_id: "", name: "", description: "", color: "" };

export default function VLANs() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useVLANs({ page, size: 100 });
  const createMut = useCreateVLAN();
  const deleteMut = useDeleteVLAN();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<VLANRead | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<VLANRead | null>(null);
  const [error, setError] = useState("");
  const updateMut = useUpdateVLAN(editing?.id ?? "");

  function openCreate() { setEditing(null); setForm(emptyForm); setError(""); setModalOpen(true); }
  function openEdit(v: VLANRead) {
    setEditing(v);
    setForm({ vlan_id: v.vlan_id.toString(), name: v.name, description: v.description ?? "", color: v.color ?? "" });
    setError(""); setModalOpen(true);
  }

  async function handleSave() {
    setError("");
    if (!form.vlan_id || !form.name.trim()) { setError("VLAN ID and name are required."); return; }
    const id = parseInt(form.vlan_id);
    if (id < 1 || id > 4094) { setError("VLAN ID must be between 1 and 4094."); return; }
    try {
      if (editing) await updateMut.mutateAsync({ name: form.name, description: form.description || null, color: form.color || null });
      else await createMut.mutateAsync({ vlan_id: id, name: form.name, description: form.description || null, color: form.color || null });
      setModalOpen(false);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Save failed.");
    }
  }

  const set = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">VLANs</h1>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
          <Plus size={16} /> Add VLAN
        </button>
      </div>

      <Table<VLANRead>
        loading={isLoading}
        data={data?.items ?? []}
        rowKey={(r) => r.id}
        columns={[
          { key: "vlan_id", header: "VLAN ID", render: (r) => (
            <span className="font-mono font-semibold text-gray-800">{r.vlan_id}</span>
          )},
          { key: "name", header: "Name" },
          { key: "description", header: "Description", render: (r) => r.description ?? "—" },
          { key: "color", header: "Color", render: (r) => r.color ? (
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded-full border border-gray-200" style={{ background: r.color }} />
              <span className="text-xs font-mono text-gray-500">{r.color}</span>
            </div>
          ) : "—" },
          {
            key: "actions", header: "",
            render: (r) => (
              <div className="flex gap-1 justify-end">
                <button onClick={() => openEdit(r)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600"><Pencil size={14} /></button>
                <button onClick={() => setDeleteTarget(r)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            ),
          },
        ]}
      />
      <Pagination page={page} size={100} total={data?.total ?? 0} onChange={setPage} />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit VLAN" : "New VLAN"} size="sm">
        <div className="space-y-3">
          {error && <p className="text-sm text-red-500">{error}</p>}
          <FormField label="VLAN ID" required><Input type="number" min={1} max={4094} value={form.vlan_id} onChange={set("vlan_id")} disabled={!!editing} /></FormField>
          <FormField label="Name" required><Input value={form.name} onChange={set("name")} /></FormField>
          <FormField label="Description"><Input value={form.description} onChange={set("description")} /></FormField>
          <FormField label="Color"><Input type="color" value={form.color || "#3b82f6"} onChange={set("color")} className="h-9 px-1 py-1 cursor-pointer" /></FormField>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
              {editing ? "Save" : "Create"}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteTarget}
        onConfirm={async () => { await deleteMut.mutateAsync(deleteTarget!.id); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
        title="Delete VLAN" description={`Delete VLAN ${deleteTarget?.vlan_id} (${deleteTarget?.name})?`} confirmLabel="Delete" danger />
    </div>
  );
}
