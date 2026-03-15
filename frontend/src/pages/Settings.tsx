import { useState } from "react";
import { Plus, Pencil, Trash2, Lock } from "lucide-react";
import {
  useDeviceTypes,
  useCreateDeviceType,
  useUpdateDeviceType,
  useDeleteDeviceType,
} from "@/api/deviceTypes";
import { Modal } from "@/components/common/Modal";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FormField, Input, Select } from "@/components/common/FormField";
import type { DeviceTypeRead } from "@/types";
import { useAuthStore } from "@/store";

const ICON_KEYS = [
  "server", "switch", "router", "firewall", "storage",
  "pdu", "patch_panel", "blade_chassis", "blade", "generic",
];

interface TypeForm {
  name: string;
  label: string;
  color: string;
  icon_key: string;
  sort_order: string;
}
const emptyTypeForm: TypeForm = {
  name: "", label: "", color: "#6b7280", icon_key: "generic", sort_order: "0",
};

function DeviceTypesSection() {
  const { data: types, isLoading } = useDeviceTypes();
  const createMut = useCreateDeviceType();
  const deleteMut = useDeleteDeviceType();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DeviceTypeRead | null>(null);
  const [form, setForm] = useState<TypeForm>(emptyTypeForm);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeviceTypeRead | null>(null);

  const updateMut = useUpdateDeviceType(editing?.id ?? "");

  function openCreate() {
    setEditing(null);
    setForm(emptyTypeForm);
    setError("");
    setModalOpen(true);
  }

  function openEdit(t: DeviceTypeRead) {
    setEditing(t);
    setForm({
      name: t.name,
      label: t.label,
      color: t.color ?? "#6b7280",
      icon_key: t.icon_key ?? "generic",
      sort_order: String(t.sort_order),
    });
    setError("");
    setModalOpen(true);
  }

  const set = (k: keyof TypeForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSave() {
    setError("");
    if (!form.label.trim()) { setError("Label is required."); return; }
    try {
      if (editing) {
        await updateMut.mutateAsync({
          label: form.label,
          color: form.color || null,
          icon_key: form.icon_key || null,
          sort_order: parseInt(form.sort_order) || 0,
        });
      } else {
        if (!form.name.trim()) { setError("Name (slug) is required."); return; }
        await createMut.mutateAsync({
          name: form.name,
          label: form.label,
          color: form.color || null,
          icon_key: form.icon_key || null,
          sort_order: parseInt(form.sort_order) || 0,
        });
      }
      setModalOpen(false);
    } catch (e: unknown) {
      setError(
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Save failed."
      );
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync(deleteTarget.id);
    } catch (e: unknown) {
      // re-surface error as an alert since ConfirmDialog doesn't show errors
      alert(
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          "Delete failed."
      );
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-gray-800">Device Types</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage the list of device types available when creating or editing devices.
            Built-in types cannot be deleted.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          <Plus size={14} /> Add Type
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {(types ?? []).map((t) => (
            <div key={t.id} className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-3">
                <span
                  className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: t.color ?? "#6b7280" }}
                />
                <div>
                  <span className="text-sm font-medium text-gray-800">{t.label}</span>
                  <span className="ml-2 text-xs text-gray-400 font-mono">{t.name}</span>
                  {t.is_builtin && (
                    <span className="ml-2 inline-flex items-center gap-0.5 text-xs text-gray-400">
                      <Lock size={10} /> built-in
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => openEdit(t)}
                  className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600"
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>
                {!t.is_builtin && (
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(t)}
                    className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit "${editing.label}"` : "New Device Type"}
        size="sm"
      >
        <div className="space-y-3">
          {error && <p className="text-sm text-red-500">{error}</p>}
          {!editing && (
            <FormField label="Name (slug)" required>
              <Input
                value={form.name}
                onChange={set("name")}
                placeholder="custom_appliance"
              />
              <p className="text-xs text-gray-400 mt-1">
                Lowercase letters, digits, and underscores. Immutable after creation.
              </p>
            </FormField>
          )}
          <FormField label="Label" required>
            <Input value={form.label} onChange={set("label")} placeholder="Custom Appliance" />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Color">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={set("color")}
                  className="w-8 h-8 rounded cursor-pointer border border-gray-300"
                />
                <Input value={form.color} onChange={set("color")} placeholder="#6b7280" />
              </div>
            </FormField>
            <FormField label="Icon">
              <Select value={form.icon_key} onChange={set("icon_key")}>
                {ICON_KEYS.map((k) => (
                  <option key={k} value={k}>{k.replace(/_/g, " ")}</option>
                ))}
              </Select>
            </FormField>
          </div>
          <FormField label="Sort Order">
            <Input type="number" value={form.sort_order} onChange={set("sort_order")} />
          </FormField>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={createMut.isPending || updateMut.isPending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
            >
              {editing ? "Save Changes" : "Create"}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        title="Delete Device Type"
        description={`Delete "${deleteTarget?.label}" (${deleteTarget?.name})? This cannot be undone. Devices currently using this type will retain the value.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}

export default function Settings() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {isAdmin && <DeviceTypesSection />}

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 shadow-sm">
        <h2 className="font-semibold text-gray-800">Application Info</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <dt className="text-gray-500">Version</dt><dd className="text-gray-900 font-medium">1.0.0</dd>
          <dt className="text-gray-500">Environment</dt><dd className="text-gray-900 font-medium">{import.meta.env.MODE}</dd>
        </dl>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="font-semibold text-gray-800 mb-1">SMTP Configuration</h2>
        <p className="text-sm text-gray-500 mb-4">Email relay for future alert notifications. Configured via environment variables on the backend.</p>
        <div className="bg-gray-50 rounded-lg p-3 text-xs font-mono text-gray-600 space-y-1">
          <p>SMTP_HOST — relay host</p>
          <p>SMTP_PORT — relay port (default 587)</p>
          <p>SMTP_USERNAME / SMTP_PASSWORD</p>
          <p>SMTP_FROM_ADDRESS</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="font-semibold text-gray-800 mb-1">Retention Policy</h2>
        <p className="text-sm text-gray-500 mb-4">Configured via environment variables. Requires backend restart to take effect.</p>
        <div className="bg-gray-50 rounded-lg p-3 text-xs font-mono text-gray-600 space-y-1">
          <p>POWER_READINGS_RETENTION_DAYS — default 90</p>
          <p>Token revocations are purged automatically on expiry.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="font-semibold text-gray-800 mb-1">Health Endpoints</h2>
        <div className="bg-gray-50 rounded-lg p-3 text-xs font-mono text-gray-600 space-y-1">
          <p>GET /api/v1/health — liveness</p>
          <p>GET /api/v1/readiness — readiness (db connectivity)</p>
          <p>GET /api/v1/metrics — Prometheus metrics</p>
        </div>
      </div>
    </div>
  );
}
