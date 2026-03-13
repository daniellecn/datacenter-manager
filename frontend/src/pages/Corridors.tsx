import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useCorridors, useCreateCorridor, useUpdateCorridor, useDeleteCorridor } from "@/api/corridors";
import { useRooms } from "@/api/rooms";
import { useDataCenters } from "@/api/datacenters";
import { Table } from "@/components/common/Table";
import { Modal } from "@/components/common/Modal";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FormField, Input, Textarea, Select } from "@/components/common/FormField";
import { Pagination } from "@/components/common/Pagination";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import type { CorridorRead } from "@/types";

interface FormData {
  room_id: string; name: string; position: string; notes: string;
}
function emptyForm(roomId: string): FormData {
  return { room_id: roomId, name: "", position: "", notes: "" };
}

export default function Corridors() {
  const [searchParams] = useSearchParams();
  const roomFilter = searchParams.get("room_id") ?? undefined;
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useCorridors({ room_id: roomFilter, page, size: 50 });
  const { data: roomData } = useRooms({ page: 1, size: 200 });
  const { data: dcData } = useDataCenters(1, 200);
  const roomList = roomData?.items ?? [];
  const dcList = dcData?.items ?? [];
  const dcMap = Object.fromEntries(dcList.map((d) => [d.id, d.name]));
  const roomMap = Object.fromEntries(roomList.map((r) => [r.id, r]));

  const createMut = useCreateCorridor();
  const deleteMut = useDeleteCorridor();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CorridorRead | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm(roomFilter ?? ""));
  const [deleteTarget, setDeleteTarget] = useState<CorridorRead | null>(null);
  const [error, setError] = useState("");
  const updateMut = useUpdateCorridor(editing?.id ?? "");

  function openCreate() { setEditing(null); setForm(emptyForm(roomFilter ?? "")); setError(""); setModalOpen(true); }
  function openEdit(c: CorridorRead) {
    setEditing(c);
    setForm({ room_id: c.room_id, name: c.name, position: c.position?.toString() ?? "", notes: c.notes ?? "" });
    setError(""); setModalOpen(true);
  }

  function toBody(f: FormData) {
    return {
      room_id: f.room_id,
      name: f.name,
      position: f.position ? parseInt(f.position) : null,
      notes: f.notes || null,
    };
  }

  async function handleSave() {
    setError("");
    if (!form.name.trim()) { setError("Name is required."); return; }
    if (!form.room_id) { setError("Room is required."); return; }
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

  const currentRoom = roomFilter ? roomMap[roomFilter] : null;
  const currentDcName = currentRoom ? dcMap[currentRoom.datacenter_id] : null;

  const crumbs = currentRoom
    ? [
        { label: "Data Centers", to: "/datacenters" },
        ...(currentDcName ? [{ label: currentDcName, to: `/rooms?datacenter_id=${currentRoom.datacenter_id}` }] : []),
        { label: "Rooms", to: roomFilter ? `/rooms?datacenter_id=${currentRoom.datacenter_id}` : "/rooms" },
        { label: currentRoom.name },
        { label: "Corridors" },
      ]
    : [{ label: "Corridors" }];

  return (
    <div className="space-y-4">
      <Breadcrumbs crumbs={crumbs} />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Corridors {currentRoom && <span className="text-lg font-normal text-gray-500 ml-2">in {currentRoom.name}</span>}
        </h1>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
          <Plus size={16} /> Add Corridor
        </button>
      </div>

      <Table<CorridorRead>
        loading={isLoading}
        data={data?.items ?? []}
        rowKey={(c) => c.id}
        onRowClick={(c) => navigate(`/racks?corridor_id=${c.id}`)}
        columns={[
          { key: "name", header: "Name" },
          { key: "room", header: "Room", render: (c) => roomMap[c.room_id]?.name ?? "—" },
          { key: "datacenter", header: "Data Center", render: (c) => {
            const room = roomMap[c.room_id];
            return room ? dcMap[room.datacenter_id] ?? "—" : "—";
          }},
          { key: "position", header: "Position", render: (c) => c.position?.toString() ?? "—" },
          { key: "notes", header: "Notes", render: (c) => c.notes ?? "—" },
          {
            key: "actions", header: "",
            render: (c) => (
              <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); openEdit(c); }}
                  className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600"><Pencil size={14} /></button>
                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget(c); }}
                  className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            ),
          },
        ]}
      />
      <Pagination page={page} size={50} total={data?.total ?? 0} onChange={setPage} />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Corridor" : "New Corridor"}>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-500">{error}</p>}
          <FormField label="Room" required>
            <Select value={form.room_id} onChange={set("room_id")} disabled={!!editing}>
              <option value="">Select…</option>
              {roomList.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </FormField>
          <FormField label="Name" required><Input value={form.name} onChange={set("name")} /></FormField>
          <FormField label="Position (order within room)">
            <Input type="number" value={form.position} onChange={set("position")} placeholder="e.g. 1" />
          </FormField>
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
        title="Delete Corridor"
        description={`Delete corridor "${deleteTarget?.name}"? This will fail if the corridor contains racks.`}
        confirmLabel="Delete" danger />
    </div>
  );
}
