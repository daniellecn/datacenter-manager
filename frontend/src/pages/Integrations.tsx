import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2, ExternalLink, RefreshCw } from "lucide-react";
import { useIntegrations, useCreateIntegration, useUpdateIntegration, useDeleteIntegration, useTriggerSync } from "@/api/integrations";
import { Table } from "@/components/common/Table";
import { Modal } from "@/components/common/Modal";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FormField, Input, Select } from "@/components/common/FormField";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/Badge";
import { formatDateTime } from "@/lib/utils";
import type { IntegrationRead } from "@/types";

const INTEGRATION_TYPES = ["xclarity","snmp","ssh","vcenter","scvmm","proxmox_api","xenserver_api"];

interface FormData {
  name: string; integration_type: string; host: string; port: string;
  enabled: boolean; polling_interval_sec: string;
  cred_username: string; cred_password: string;
}
const emptyForm: FormData = { name: "", integration_type: "vcenter", host: "", port: "",
  enabled: true, polling_interval_sec: "3600", cred_username: "", cred_password: "" };

function SyncButton({ id }: { id: string }) {
  const trigger = useTriggerSync(id);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); trigger.mutate(); }}
      disabled={trigger.isPending}
      className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-green-600 disabled:opacity-50"
      title="Trigger sync"
    >
      <RefreshCw size={14} className={trigger.isPending ? "animate-spin" : ""} />
    </button>
  );
}

export default function Integrations() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useIntegrations({ page, size: 50 });
  const createMut = useCreateIntegration();
  const deleteMut = useDeleteIntegration();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<IntegrationRead | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<IntegrationRead | null>(null);
  const [error, setError] = useState("");
  const updateMut = useUpdateIntegration(editing?.id ?? "");

  function openCreate() { setEditing(null); setForm(emptyForm); setError(""); setModalOpen(true); }
  function openEdit(i: IntegrationRead) {
    setEditing(i);
    setForm({ name: i.name, integration_type: i.integration_type, host: i.host ?? "",
      port: i.port?.toString() ?? "", enabled: i.enabled,
      polling_interval_sec: i.polling_interval_sec.toString(),
      cred_username: "", cred_password: "" });
    setError(""); setModalOpen(true);
  }

  async function handleSave() {
    setError("");
    if (!form.name || !form.host) { setError("Name and host are required."); return; }
    try {
      const body: Record<string, unknown> = {
        name: form.name, integration_type: form.integration_type,
        host: form.host, port: form.port ? parseInt(form.port) : null,
        enabled: form.enabled, polling_interval_sec: parseInt(form.polling_interval_sec) || 3600,
      };
      if (form.cred_username || form.cred_password) {
        body.credentials = { username: form.cred_username, password: form.cred_password };
      }
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
        <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
          <Plus size={16} /> Add Integration
        </button>
      </div>

      <Table<IntegrationRead>
        loading={isLoading}
        data={data?.items ?? []}
        rowKey={(r) => r.id}
        columns={[
          { key: "name", header: "Name", render: (r) => (
            <button onClick={() => navigate(`/integrations/${r.id}`)} className="text-blue-600 hover:underline font-medium flex items-center gap-1">
              {r.name} <ExternalLink size={12} />
            </button>
          )},
          { key: "integration_type", header: "Type", render: (r) => r.integration_type.replace(/_/g, " ") },
          { key: "host", header: "Host", render: (r) => r.host ?? "—" },
          { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
          { key: "enabled", header: "Enabled", render: (r) => (
            <span className={`text-xs font-medium ${r.enabled ? "text-green-600" : "text-gray-400"}`}>
              {r.enabled ? "Yes" : "No"}
            </span>
          )},
          { key: "last_polled_at", header: "Last Sync", render: (r) => formatDateTime(r.last_polled_at) },
          {
            key: "actions", header: "",
            render: (r) => (
              <div className="flex gap-1 justify-end">
                <SyncButton id={r.id} />
                <button onClick={(e) => { e.stopPropagation(); openEdit(r); }} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600"><Pencil size={14} /></button>
                <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(r); }} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            ),
          },
        ]}
      />
      <Pagination page={page} size={50} total={data?.total ?? 0} onChange={setPage} />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Integration" : "New Integration"}>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Name" required><Input value={form.name} onChange={set("name")} /></FormField>
            <FormField label="Type">
              <Select value={form.integration_type} onChange={set("integration_type")} disabled={!!editing}>
                {INTEGRATION_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </Select>
            </FormField>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Host" required className="col-span-2"><Input value={form.host} onChange={set("host")} placeholder="192.168.1.100" /></FormField>
            <FormField label="Port"><Input type="number" value={form.port} onChange={set("port")} placeholder="443" /></FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Username"><Input value={form.cred_username} onChange={set("cred_username")} /></FormField>
            <FormField label="Password"><Input type="password" value={form.cred_password} onChange={set("cred_password")} autoComplete="new-password" /></FormField>
          </div>
          <FormField label="Polling Interval (seconds)"><Input type="number" value={form.polling_interval_sec} onChange={set("polling_interval_sec")} /></FormField>
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
        title="Delete Integration" description={`Delete "${deleteTarget?.name}"?`} confirmLabel="Delete" danger />
    </div>
  );
}
