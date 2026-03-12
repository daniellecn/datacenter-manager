import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useLicenses, useCreateLicense, useUpdateLicense, useDeleteLicense, useExpiringLicenses } from "@/api/licenses";
import { useDevices } from "@/api/devices";
import { Table } from "@/components/common/Table";
import { Modal } from "@/components/common/Modal";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FormField, Input, Textarea, Select } from "@/components/common/FormField";
import { Pagination } from "@/components/common/Pagination";
import { Badge } from "@/components/common/Badge";
import { formatDate } from "@/lib/utils";
import type { LicenseRead } from "@/types";

const LICENSE_TYPES = ["perpetual","subscription","per_socket","per_core","per_vm","site"];

interface FormData {
  device_id: string; product_name: string; vendor: string; license_type: string;
  quantity: string; purchase_date: string; expiry_date: string;
  cost_usd: string; renewal_reminder_days: string; license_key: string; notes: string;
}
const emptyForm: FormData = { device_id: "", product_name: "", vendor: "", license_type: "subscription",
  quantity: "", purchase_date: "", expiry_date: "", cost_usd: "", renewal_reminder_days: "90",
  license_key: "", notes: "" };

function daysUntil(d: string | null): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

function ExpiryBadge({ date }: { date: string | null }) {
  const days = daysUntil(date);
  if (days == null) return <span className="text-gray-400">No expiry</span>;
  if (days < 0) return <Badge variant="danger">Expired</Badge>;
  if (days <= 30) return <Badge variant="danger">{days}d</Badge>;
  if (days <= 90) return <Badge variant="warning">{days}d</Badge>;
  return <Badge variant="success">{formatDate(date)}</Badge>;
}

export default function Licenses() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useLicenses({ page, size: 50 });
  const { data: expiring } = useExpiringLicenses(90);
  const { data: devicesData } = useDevices({ size: 500 });
  const deviceList = devicesData?.items ?? [];
  const deviceMap = Object.fromEntries(deviceList.map((d) => [d.id, d.name]));

  const createMut = useCreateLicense();
  const deleteMut = useDeleteLicense();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LicenseRead | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<LicenseRead | null>(null);
  const [error, setError] = useState("");
  const updateMut = useUpdateLicense(editing?.id ?? "");

  function openCreate() { setEditing(null); setForm(emptyForm); setError(""); setModalOpen(true); }
  function openEdit(l: LicenseRead) {
    setEditing(l);
    setForm({ device_id: l.device_id ?? "", product_name: l.product_name, vendor: l.vendor ?? "",
      license_type: l.license_type, quantity: l.quantity?.toString() ?? "",
      purchase_date: l.purchase_date ?? "", expiry_date: l.expiry_date ?? "",
      cost_usd: l.cost_usd ?? "", renewal_reminder_days: l.renewal_reminder_days.toString(),
      license_key: "", notes: l.notes ?? "" });
    setError(""); setModalOpen(true);
  }

  function toBody(f: FormData) {
    return {
      device_id: f.device_id || null, product_name: f.product_name, vendor: f.vendor || null,
      license_type: f.license_type, quantity: f.quantity ? parseInt(f.quantity) : null,
      purchase_date: f.purchase_date || null, expiry_date: f.expiry_date || null,
      cost_usd: f.cost_usd ? parseFloat(f.cost_usd) : null,
      renewal_reminder_days: parseInt(f.renewal_reminder_days) || 90,
      license_key: f.license_key || undefined, notes: f.notes || null,
    };
  }

  async function handleSave() {
    setError("");
    if (!form.product_name.trim()) { setError("Product name is required."); return; }
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Licenses</h1>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
          <Plus size={16} /> Add License
        </button>
      </div>

      {expiring && expiring.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-yellow-800 mb-2">Expiring within 90 days ({expiring.length})</p>
          <div className="flex flex-wrap gap-2">
            {expiring.slice(0, 8).map((l) => (
              <span key={l.id} className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">
                {l.product_name} — {formatDate(l.expiry_date)}
              </span>
            ))}
          </div>
        </div>
      )}

      <Table<LicenseRead>
        loading={isLoading}
        data={data?.items ?? []}
        rowKey={(r) => r.id}
        columns={[
          { key: "product_name", header: "Product" },
          { key: "vendor", header: "Vendor", render: (r) => r.vendor ?? "—" },
          { key: "device", header: "Device", render: (r) => r.device_id ? (deviceMap[r.device_id] ?? "—") : "—" },
          { key: "license_type", header: "Type", render: (r) => r.license_type.replace(/_/g, " ") },
          { key: "quantity", header: "Qty", render: (r) => r.quantity?.toString() ?? "—" },
          { key: "expiry", header: "Expiry", render: (r) => <ExpiryBadge date={r.expiry_date} /> },
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit License" : "New License"}>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-500">{error}</p>}
          <FormField label="Product Name" required><Input value={form.product_name} onChange={set("product_name")} /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Vendor"><Input value={form.vendor} onChange={set("vendor")} /></FormField>
            <FormField label="License Type">
              <Select value={form.license_type} onChange={set("license_type")}>
                {LICENSE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </Select>
            </FormField>
          </div>
          <FormField label="Device">
            <Select value={form.device_id} onChange={set("device_id")}>
              <option value="">None</option>
              {deviceList.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </FormField>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Quantity"><Input type="number" value={form.quantity} onChange={set("quantity")} /></FormField>
            <FormField label="Cost (USD)"><Input type="number" step="0.01" value={form.cost_usd} onChange={set("cost_usd")} /></FormField>
            <FormField label="Reminder (days)"><Input type="number" value={form.renewal_reminder_days} onChange={set("renewal_reminder_days")} /></FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Purchase Date"><Input type="date" value={form.purchase_date} onChange={set("purchase_date")} /></FormField>
            <FormField label="Expiry Date"><Input type="date" value={form.expiry_date} onChange={set("expiry_date")} /></FormField>
          </div>
          <FormField label="License Key"><Input type="password" value={form.license_key} onChange={set("license_key")} autoComplete="off" /></FormField>
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
        title="Delete License" description={`Delete license "${deleteTarget?.product_name}"?`} confirmLabel="Delete" danger />
    </div>
  );
}
