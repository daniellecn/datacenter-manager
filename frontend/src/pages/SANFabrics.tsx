import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useSANFabrics, useCreateSANFabric, useUpdateSANFabric, useDeleteSANFabric } from "@/api/sanFabrics";
import { Table } from "@/components/common/Table";
import { Modal } from "@/components/common/Modal";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FormField, Input, Select } from "@/components/common/FormField";
import { Pagination } from "@/components/common/Pagination";
import type { SANFabricRead } from "@/types";

const FABRIC_TYPES = ["fc","iscsi","fcoe","nvme_of"];

interface FormData { name: string; fabric_type: string; speed_gbps: string; wwn: string; }
const emptyForm: FormData = { name: "", fabric_type: "fc", speed_gbps: "", wwn: "" };

export default function SANFabrics() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useSANFabrics({ page, size: 50 });
  const createMut = useCreateSANFabric();
  const deleteMut = useDeleteSANFabric();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SANFabricRead | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<SANFabricRead | null>(null);
  const [error, setError] = useState("");
  const updateMut = useUpdateSANFabric(editing?.id ?? "");

  function openCreate() { setEditing(null); setForm(emptyForm); setError(""); setModalOpen(true); }
  function openEdit(s: SANFabricRead) {
    setEditing(s);
    setForm({ name: s.name, fabric_type: s.fabric_type, speed_gbps: s.speed_gbps?.toString() ?? "", wwn: s.wwn ?? "" });
    setError(""); setModalOpen(true);
  }

  async function handleSave() {
    setError("");
    if (!form.name.trim()) { setError("Name is required."); return; }
    try {
      const body = { name: form.name, fabric_type: form.fabric_type,
        speed_gbps: form.speed_gbps ? parseInt(form.speed_gbps) : null, wwn: form.wwn || null };
      if (editing) await updateMut.mutateAsync(body);
      else await createMut.mutateAsync(body);
      setModalOpen(false);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Save failed.");
    }
  }

  const set = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">SAN Fabrics</h1>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
          <Plus size={16} /> Add Fabric
        </button>
      </div>

      <Table<SANFabricRead>
        loading={isLoading}
        data={data?.items ?? []}
        rowKey={(r) => r.id}
        columns={[
          { key: "name", header: "Name" },
          { key: "fabric_type", header: "Type", render: (r) => r.fabric_type.toUpperCase().replace(/_/g, "-") },
          { key: "speed_gbps", header: "Speed", render: (r) => r.speed_gbps ? `${r.speed_gbps} Gbps` : "—" },
          { key: "wwn", header: "WWN", render: (r) => r.wwn ? <span className="font-mono text-xs">{r.wwn}</span> : "—" },
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
      <Pagination page={page} size={50} total={data?.total ?? 0} onChange={setPage} />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit SAN Fabric" : "New SAN Fabric"} size="sm">
        <div className="space-y-3">
          {error && <p className="text-sm text-red-500">{error}</p>}
          <FormField label="Name" required><Input value={form.name} onChange={set("name")} /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Type">
              <Select value={form.fabric_type} onChange={set("fabric_type")}>
                {FABRIC_TYPES.map((t) => <option key={t} value={t}>{t.toUpperCase().replace(/_/g, "-")}</option>)}
              </Select>
            </FormField>
            <FormField label="Speed (Gbps)"><Input type="number" value={form.speed_gbps} onChange={set("speed_gbps")} /></FormField>
          </div>
          <FormField label="WWN"><Input value={form.wwn} onChange={set("wwn")} placeholder="20:00:00:…" /></FormField>
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
        title="Delete SAN Fabric" description={`Delete fabric "${deleteTarget?.name}"?`} confirmLabel="Delete" danger />
    </div>
  );
}
