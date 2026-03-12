import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useRooms, useCreateRoom, useUpdateRoom, useDeleteRoom } from "@/api/rooms";
import { useDataCenters } from "@/api/datacenters";
import { Table } from "@/components/common/Table";
import { Modal } from "@/components/common/Modal";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FormField, Input, Textarea, Select } from "@/components/common/FormField";
import { Pagination } from "@/components/common/Pagination";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import type { RoomRead } from "@/types";

const COOLING_TYPES = ["crac", "crah", "row_based", "in_row", "free_cooling"];

interface FormData {
  datacenter_id: string; name: string; floor: string;
  cooling_type: string; raised_floor: boolean;
  width_m: string; depth_m: string; height_m: string; max_power_kw: string; notes: string;
}
function emptyForm(dcId: string): FormData {
  return { datacenter_id: dcId, name: "", floor: "", cooling_type: "",
    raised_floor: false, width_m: "", depth_m: "", height_m: "", max_power_kw: "", notes: "" };
}

export default function Rooms() {
  const [searchParams] = useSearchParams();
  const dcFilter = searchParams.get("datacenter_id") ?? undefined;
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useRooms({ datacenter_id: dcFilter, page, size: 50 });
  const { data: dcData } = useDataCenters(1, 200);
  const dcList = dcData?.items ?? [];
  const dcMap = Object.fromEntries(dcList.map((d) => [d.id, d.name]));

  const createMut = useCreateRoom();
  const deleteMut = useDeleteRoom();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RoomRead | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm(dcFilter ?? ""));
  const [deleteTarget, setDeleteTarget] = useState<RoomRead | null>(null);
  const [error, setError] = useState("");
  const updateMut = useUpdateRoom(editing?.id ?? "");

  function openCreate() { setEditing(null); setForm(emptyForm(dcFilter ?? "")); setError(""); setModalOpen(true); }
  function openEdit(r: RoomRead) {
    setEditing(r);
    setForm({ datacenter_id: r.datacenter_id, name: r.name, floor: r.floor?.toString() ?? "",
      cooling_type: r.cooling_type ?? "", raised_floor: r.raised_floor,
      width_m: r.width_m ?? "", depth_m: r.depth_m ?? "", height_m: r.height_m ?? "",
      max_power_kw: r.max_power_kw ?? "", notes: r.notes ?? "" });
    setError(""); setModalOpen(true);
  }

  function toBody(f: FormData) {
    return {
      datacenter_id: f.datacenter_id, name: f.name,
      floor: f.floor ? parseInt(f.floor) : null,
      cooling_type: f.cooling_type || null, raised_floor: f.raised_floor,
      width_m: f.width_m ? parseFloat(f.width_m) : null,
      depth_m: f.depth_m ? parseFloat(f.depth_m) : null,
      height_m: f.height_m ? parseFloat(f.height_m) : null,
      max_power_kw: f.max_power_kw ? parseFloat(f.max_power_kw) : null,
      notes: f.notes || null,
    };
  }

  async function handleSave() {
    setError("");
    if (!form.name.trim()) { setError("Name is required."); return; }
    if (!form.datacenter_id) { setError("Data center is required."); return; }
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

  const dcName = dcFilter ? dcMap[dcFilter] : null;

  return (
    <div className="space-y-4">
      <Breadcrumbs crumbs={dcName
        ? [{ label: "Data Centers", to: "/datacenters" }, { label: dcName }, { label: "Rooms" }]
        : [{ label: "Rooms" }]} />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Rooms {dcName && <span className="text-lg font-normal text-gray-500 ml-2">in {dcName}</span>}
        </h1>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
          <Plus size={16} /> Add Room
        </button>
      </div>

      <Table<RoomRead>
        loading={isLoading}
        data={data?.items ?? []}
        rowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/racks?room_id=${r.id}`)}
        columns={[
          { key: "name", header: "Name" },
          { key: "datacenter", header: "Data Center", render: (r) => dcMap[r.datacenter_id] ?? "—" },
          { key: "floor", header: "Floor", render: (r) => r.floor?.toString() ?? "—" },
          { key: "cooling_type", header: "Cooling", render: (r) => r.cooling_type?.replace(/_/g, " ") ?? "—" },
          { key: "max_power_kw", header: "Max Power (kW)", render: (r) => r.max_power_kw ?? "—" },
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Room" : "New Room"}>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-500">{error}</p>}
          <FormField label="Data Center" required>
            <Select value={form.datacenter_id} onChange={set("datacenter_id")}>
              <option value="">Select…</option>
              {dcList.map((dc) => <option key={dc.id} value={dc.id}>{dc.name}</option>)}
            </Select>
          </FormField>
          <FormField label="Name" required><Input value={form.name} onChange={set("name")} /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Floor"><Input type="number" value={form.floor} onChange={set("floor")} /></FormField>
            <FormField label="Cooling Type">
              <Select value={form.cooling_type} onChange={set("cooling_type")}>
                <option value="">None</option>
                {COOLING_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </Select>
            </FormField>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Width (m)"><Input type="number" step="0.1" value={form.width_m} onChange={set("width_m")} /></FormField>
            <FormField label="Depth (m)"><Input type="number" step="0.1" value={form.depth_m} onChange={set("depth_m")} /></FormField>
            <FormField label="Height (m)"><Input type="number" step="0.1" value={form.height_m} onChange={set("height_m")} /></FormField>
          </div>
          <FormField label="Max Power (kW)"><Input type="number" step="0.1" value={form.max_power_kw} onChange={set("max_power_kw")} /></FormField>
          <FormField label="Notes"><Textarea value={form.notes} onChange={set("notes")} /></FormField>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
              {editing ? "Save Changes" : "Create"}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteTarget}
        onConfirm={async () => { await deleteMut.mutateAsync(deleteTarget!.id); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
        title="Delete Room" description={`Delete room "${deleteTarget?.name}"?`} confirmLabel="Delete" danger />
    </div>
  );
}
