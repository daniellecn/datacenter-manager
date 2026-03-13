import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Pencil, Trash2, Zap } from "lucide-react";
import { useRacks, useCreateRack, useUpdateRack, useDeleteRack, useRackPowerSummary } from "@/api/racks";
import { useCorridors } from "@/api/corridors";
import { useRooms } from "@/api/rooms";
import { Table } from "@/components/common/Table";
import { Modal } from "@/components/common/Modal";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FormField, Input, Textarea, Select } from "@/components/common/FormField";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/Badge";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import type { RackRead } from "@/types";

const AIRFLOW = ["front_to_back", "back_to_front", "top_exhaust"];
const RACK_STATUS = ["active", "reserved", "decommissioned"];

interface FormData {
  corridor_id: string; name: string; row: string; column: string;
  total_u: string; max_power_w: string; max_weight_kg: string;
  airflow_direction: string; power_feed_count: string;
  manufacturer: string; model: string; serial_number: string;
  status: string; notes: string;
}
function emptyForm(corridorId: string): FormData {
  return { corridor_id: corridorId, name: "", row: "", column: "",
    total_u: "42", max_power_w: "", max_weight_kg: "",
    airflow_direction: "", power_feed_count: "2",
    manufacturer: "", model: "", serial_number: "",
    status: "active", notes: "" };
}

function PowerBar({ rackId }: { rackId: string }) {
  const { data } = useRackPowerSummary(rackId);
  if (!data || data.utilization_pct == null) return <span className="text-gray-400">—</span>;
  const pct = Math.min(100, data.utilization_pct);
  const color = pct >= 80 ? "bg-red-500" : pct >= 60 ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-600">{pct.toFixed(0)}%</span>
    </div>
  );
}

export default function Racks() {
  const [searchParams] = useSearchParams();
  const corridorFilter = searchParams.get("corridor_id") ?? undefined;
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useRacks({ corridor_id: corridorFilter, page, size: 50 });
  const { data: corridorData } = useCorridors({ page: 1, size: 200 });
  const { data: roomData } = useRooms({ page: 1, size: 200 });
  const corridorList = corridorData?.items ?? [];
  const roomList = roomData?.items ?? [];
  const corridorMap = Object.fromEntries(corridorList.map((c) => [c.id, c]));
  const roomMap = Object.fromEntries(roomList.map((r) => [r.id, r.name]));

  const createMut = useCreateRack();
  const deleteMut = useDeleteRack();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RackRead | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm(corridorFilter ?? ""));
  const [deleteTarget, setDeleteTarget] = useState<RackRead | null>(null);
  const [error, setError] = useState("");
  const updateMut = useUpdateRack(editing?.id ?? "");

  function openCreate() { setEditing(null); setForm(emptyForm(corridorFilter ?? "")); setError(""); setModalOpen(true); }
  function openEdit(r: RackRead) {
    setEditing(r);
    setForm({ corridor_id: r.corridor_id, name: r.name, row: r.row ?? "", column: r.column ?? "",
      total_u: r.total_u.toString(), max_power_w: r.max_power_w?.toString() ?? "",
      max_weight_kg: r.max_weight_kg ?? "", airflow_direction: r.airflow_direction ?? "",
      power_feed_count: r.power_feed_count.toString(),
      manufacturer: r.manufacturer ?? "", model: r.model ?? "",
      serial_number: r.serial_number ?? "", status: r.status, notes: r.notes ?? "" });
    setError(""); setModalOpen(true);
  }

  function toBody(f: FormData) {
    return {
      corridor_id: f.corridor_id, name: f.name, row: f.row || null, column: f.column || null,
      total_u: parseInt(f.total_u) || 42,
      max_power_w: f.max_power_w ? parseInt(f.max_power_w) : null,
      max_weight_kg: f.max_weight_kg ? parseFloat(f.max_weight_kg) : null,
      airflow_direction: f.airflow_direction || null,
      power_feed_count: parseInt(f.power_feed_count) || 2,
      manufacturer: f.manufacturer || null, model: f.model || null,
      serial_number: f.serial_number || null, status: f.status, notes: f.notes || null,
    };
  }

  async function handleSave() {
    setError("");
    if (!form.name.trim()) { setError("Name is required."); return; }
    if (!form.corridor_id) { setError("Corridor is required."); return; }
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

  const currentCorridor = corridorFilter ? corridorMap[corridorFilter] : null;
  const currentRoomName = currentCorridor ? roomMap[currentCorridor.room_id] : null;

  const crumbs = currentCorridor
    ? [
        { label: "Rooms", to: "/rooms" },
        ...(currentRoomName ? [{ label: currentRoomName, to: `/corridors?room_id=${currentCorridor.room_id}` }] : []),
        { label: "Corridors", to: `/corridors?room_id=${currentCorridor.room_id}` },
        { label: currentCorridor.name },
        { label: "Racks" },
      ]
    : [{ label: "Racks" }];

  return (
    <div className="space-y-4">
      <Breadcrumbs crumbs={crumbs} />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Racks {currentCorridor && <span className="text-lg font-normal text-gray-500 ml-2">in {currentCorridor.name}</span>}
        </h1>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
          <Plus size={16} /> Add Rack
        </button>
      </div>

      <Table<RackRead>
        loading={isLoading}
        data={data?.items ?? []}
        rowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/devices?rack_id=${r.id}`)}
        columns={[
          { key: "name", header: "Name" },
          { key: "corridor", header: "Corridor", render: (r) => corridorMap[r.corridor_id]?.name ?? "—" },
          { key: "room", header: "Room", render: (r) => {
            const corridor = corridorMap[r.corridor_id];
            return corridor ? roomMap[corridor.room_id] ?? "—" : "—";
          }},
          { key: "location", header: "Row/Col", render: (r) => [r.row, r.column].filter(Boolean).join("-") || "—" },
          { key: "total_u", header: "U Size" },
          { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
          { key: "power", header: <span className="flex items-center gap-1"><Zap size={13} />Power</span> as unknown as string,
            render: (r) => <PowerBar rackId={r.id} /> },
          {
            key: "actions", header: "",
            render: (r) => (
              <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); openEdit(r); }}
                  className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600"><Pencil size={14} /></button>
                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget(r); }}
                  className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            ),
          },
        ]}
      />
      <Pagination page={page} size={50} total={data?.total ?? 0} onChange={setPage} />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Rack" : "New Rack"} size="lg">
        <div className="space-y-3">
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Corridor" required>
              <Select value={form.corridor_id} onChange={set("corridor_id")}>
                <option value="">Select…</option>
                {corridorList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({roomMap[c.room_id] ?? "?"})
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Name" required><Input value={form.name} onChange={set("name")} /></FormField>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <FormField label="Row"><Input value={form.row} onChange={set("row")} /></FormField>
            <FormField label="Column"><Input value={form.column} onChange={set("column")} /></FormField>
            <FormField label="Total U"><Input type="number" value={form.total_u} onChange={set("total_u")} /></FormField>
            <FormField label="Power Feeds"><Input type="number" value={form.power_feed_count} onChange={set("power_feed_count")} /></FormField>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Max Power (W)"><Input type="number" value={form.max_power_w} onChange={set("max_power_w")} /></FormField>
            <FormField label="Max Weight (kg)"><Input type="number" step="0.1" value={form.max_weight_kg} onChange={set("max_weight_kg")} /></FormField>
            <FormField label="Airflow">
              <Select value={form.airflow_direction} onChange={set("airflow_direction")}>
                <option value="">None</option>
                {AIRFLOW.map((a) => <option key={a} value={a}>{a.replace(/_/g, " ")}</option>)}
              </Select>
            </FormField>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Manufacturer"><Input value={form.manufacturer} onChange={set("manufacturer")} /></FormField>
            <FormField label="Model"><Input value={form.model} onChange={set("model")} /></FormField>
            <FormField label="Serial Number"><Input value={form.serial_number} onChange={set("serial_number")} /></FormField>
          </div>
          <FormField label="Status">
            <Select value={form.status} onChange={set("status")}>
              {RACK_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
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
        title="Delete Rack" description={`Delete rack "${deleteTarget?.name}"?`} confirmLabel="Delete" danger />
    </div>
  );
}
