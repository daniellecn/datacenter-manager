import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useLinks, useCreateLink, useDeleteLink, useLAGGroups, useCreateLAGGroup, useDeleteLAGGroup } from "@/api/links";
import { useInterfaces } from "@/api/interfaces";
import { useDevices } from "@/api/devices";
import { Table } from "@/components/common/Table";
import { Modal } from "@/components/common/Modal";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FormField, Input, Select, Textarea } from "@/components/common/FormField";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/Badge";
import type { NetworkLinkRead, LAGGroupRead } from "@/types";

const LINK_TYPES = ["ethernet","fiber_sm","fiber_mm","dac","fc","iscsi","lacp_member","virtual"];
const LINK_STATUS = ["active","inactive","planned"];
const LAG_MODES = ["lacp","static","active_backup"];

interface LinkForm {
  source_interface_id: string; target_interface_id: string;
  link_type: string; speed_mbps: string; cable_label: string;
  cable_color: string; status: string; notes: string;
}
const emptyLink: LinkForm = { source_interface_id: "", target_interface_id: "",
  link_type: "ethernet", speed_mbps: "", cable_label: "", cable_color: "",
  status: "active", notes: "" };

interface LAGForm { device_id: string; name: string; mode: string; combined_speed_mbps: string; }
const emptyLAG: LAGForm = { device_id: "", name: "", mode: "lacp", combined_speed_mbps: "" };

type ActiveTab = "links" | "lag";

export default function NetworkConnections() {
  const [tab, setTab] = useState<ActiveTab>("links");
  const [page, setPage] = useState(1);

  const { data: linksData, isLoading: linksLoading } = useLinks({ page, size: 50 });
  const { data: lagData, isLoading: lagLoading } = useLAGGroups({});
  const { data: ifacesData } = useInterfaces({ size: 500 });
  const { data: devicesData } = useDevices({ size: 500 });

  const ifaceList = ifacesData?.items ?? [];
  const deviceList = devicesData?.items ?? [];
  const deviceMap = Object.fromEntries(deviceList.map((d) => [d.id, d.name]));
  const ifaceLabel = (id: string) => {
    const iface = ifaceList.find((i) => i.id === id);
    if (!iface) return id.slice(0, 8);
    const devName = deviceMap[iface.device_id] ?? "?";
    return `${devName}:${iface.name}`;
  };

  const createLinkMut = useCreateLink();
  const deleteLinkMut = useDeleteLink();
  const createLAGMut = useCreateLAGGroup();
  const deleteLAGMut = useDeleteLAGGroup();

  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkForm, setLinkForm] = useState<LinkForm>(emptyLink);
  const [lagModalOpen, setLAGModalOpen] = useState(false);
  const [lagForm, setLAGForm] = useState<LAGForm>(emptyLAG);
  const [deleteLink, setDeleteLink] = useState<NetworkLinkRead | null>(null);
  const [deleteLAG, setDeleteLAG] = useState<LAGGroupRead | null>(null);
  const [error, setError] = useState("");

  const setLink = (k: keyof LinkForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setLinkForm((f) => ({ ...f, [k]: e.target.value }));
  const setLAG = (k: keyof LAGForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setLAGForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSaveLink() {
    setError("");
    if (!linkForm.source_interface_id || !linkForm.target_interface_id) { setError("Both interfaces are required."); return; }
    try {
      await createLinkMut.mutateAsync({
        source_interface_id: linkForm.source_interface_id, target_interface_id: linkForm.target_interface_id,
        link_type: linkForm.link_type, speed_mbps: linkForm.speed_mbps ? parseInt(linkForm.speed_mbps) : null,
        cable_label: linkForm.cable_label || null, cable_color: linkForm.cable_color || null,
        status: linkForm.status, notes: linkForm.notes || null,
      });
      setLinkModalOpen(false); setLinkForm(emptyLink);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Save failed.");
    }
  }

  async function handleSaveLAG() {
    setError("");
    if (!lagForm.device_id || !lagForm.name) { setError("Device and name are required."); return; }
    try {
      await createLAGMut.mutateAsync({
        device_id: lagForm.device_id, name: lagForm.name, mode: lagForm.mode,
        combined_speed_mbps: lagForm.combined_speed_mbps ? parseInt(lagForm.combined_speed_mbps) : null,
      });
      setLAGModalOpen(false); setLAGForm(emptyLAG);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Save failed.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Network Connections</h1>
        <button
          onClick={() => tab === "links" ? (setLinkModalOpen(true), setError("")) : (setLAGModalOpen(true), setError(""))}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          <Plus size={16} /> {tab === "links" ? "Add Link" : "Add LAG Group"}
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="flex border-b border-gray-200">
        {(["links", "lag"] as ActiveTab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-medium -mb-px capitalize ${t === tab ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500 hover:text-gray-800"}`}>
            {t === "links" ? "Physical Links" : "LAG Groups"}
          </button>
        ))}
      </div>

      {tab === "links" && (
        <>
          <Table<NetworkLinkRead>
            loading={linksLoading}
            data={linksData?.items ?? []}
            rowKey={(r) => r.id}
            columns={[
              { key: "source", header: "Source", render: (r) => ifaceLabel(r.source_interface_id) },
              { key: "target", header: "Target", render: (r) => ifaceLabel(r.target_interface_id) },
              { key: "link_type", header: "Type", render: (r) => r.link_type.replace(/_/g, " ") },
              { key: "speed_mbps", header: "Speed", render: (r) => r.speed_mbps ? `${r.speed_mbps} Mbps` : "—" },
              { key: "cable_label", header: "Cable", render: (r) => r.cable_label ?? "—" },
              { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
              { key: "actions", header: "", render: (r) => (
                <button onClick={() => setDeleteLink(r)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
              )},
            ]}
          />
          <Pagination page={page} size={50} total={linksData?.total ?? 0} onChange={setPage} />
        </>
      )}

      {tab === "lag" && (
        <Table<LAGGroupRead>
          loading={lagLoading}
          data={lagData?.items ?? []}
          rowKey={(r) => r.id}
          columns={[
            { key: "name", header: "Name" },
            { key: "device", header: "Device", render: (r) => deviceMap[r.device_id] ?? "—" },
            { key: "mode", header: "Mode", render: (r) => r.mode.toUpperCase() },
            { key: "speed", header: "Combined Speed", render: (r) => r.combined_speed_mbps ? `${r.combined_speed_mbps} Mbps` : "—" },
            { key: "actions", header: "", render: (r) => (
              <button onClick={() => setDeleteLAG(r)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
            )},
          ]}
        />
      )}

      {/* Add Link Modal */}
      <Modal open={linkModalOpen} onClose={() => setLinkModalOpen(false)} title="New Network Link">
        <div className="space-y-3">
          {error && <p className="text-sm text-red-500">{error}</p>}
          <FormField label="Source Interface" required>
            <Select value={linkForm.source_interface_id} onChange={setLink("source_interface_id")}>
              <option value="">Select…</option>
              {ifaceList.map((i) => <option key={i.id} value={i.id}>{deviceMap[i.device_id] ?? "?"} — {i.name}</option>)}
            </Select>
          </FormField>
          <FormField label="Target Interface" required>
            <Select value={linkForm.target_interface_id} onChange={setLink("target_interface_id")}>
              <option value="">Select…</option>
              {ifaceList.map((i) => <option key={i.id} value={i.id}>{deviceMap[i.device_id] ?? "?"} — {i.name}</option>)}
            </Select>
          </FormField>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Link Type">
              <Select value={linkForm.link_type} onChange={setLink("link_type")}>
                {LINK_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </Select>
            </FormField>
            <FormField label="Speed (Mbps)"><Input type="number" value={linkForm.speed_mbps} onChange={setLink("speed_mbps")} /></FormField>
            <FormField label="Status">
              <Select value={linkForm.status} onChange={setLink("status")}>
                {LINK_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Cable Label"><Input value={linkForm.cable_label} onChange={setLink("cable_label")} /></FormField>
            <FormField label="Cable Color"><Input value={linkForm.cable_color} onChange={setLink("cable_color")} placeholder="#3b82f6" /></FormField>
          </div>
          <FormField label="Notes"><Textarea value={linkForm.notes} onChange={setLink("notes")} /></FormField>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setLinkModalOpen(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={handleSaveLink} disabled={createLinkMut.isPending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">Create</button>
          </div>
        </div>
      </Modal>

      {/* Add LAG Modal */}
      <Modal open={lagModalOpen} onClose={() => setLAGModalOpen(false)} title="New LAG Group">
        <div className="space-y-3">
          {error && <p className="text-sm text-red-500">{error}</p>}
          <FormField label="Device" required>
            <Select value={lagForm.device_id} onChange={setLAG("device_id")}>
              <option value="">Select…</option>
              {deviceList.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </FormField>
          <FormField label="Name" required><Input value={lagForm.name} onChange={setLAG("name")} /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Mode">
              <Select value={lagForm.mode} onChange={setLAG("mode")}>
                {LAG_MODES.map((m) => <option key={m} value={m}>{m.replace(/_/g, " ").toUpperCase()}</option>)}
              </Select>
            </FormField>
            <FormField label="Combined Speed (Mbps)"><Input type="number" value={lagForm.combined_speed_mbps} onChange={setLAG("combined_speed_mbps")} /></FormField>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setLAGModalOpen(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={handleSaveLAG} disabled={createLAGMut.isPending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">Create</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteLink}
        onConfirm={async () => { await deleteLinkMut.mutateAsync(deleteLink!.id); setDeleteLink(null); }}
        onCancel={() => setDeleteLink(null)} title="Delete Link" description="Delete this network link?" confirmLabel="Delete" danger />
      <ConfirmDialog open={!!deleteLAG}
        onConfirm={async () => { await deleteLAGMut.mutateAsync(deleteLAG!.id); setDeleteLAG(null); }}
        onCancel={() => setDeleteLAG(null)} title="Delete LAG Group" description={`Delete LAG group "${deleteLAG?.name}"?`} confirmLabel="Delete" danger />
    </div>
  );
}
