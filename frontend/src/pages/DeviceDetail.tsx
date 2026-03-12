import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil } from "lucide-react";
import * as Tabs from "@radix-ui/react-tabs";
import { useDevice, useUpdateDevice, useDevicePowerReadings } from "@/api/devices";
import { useInterfaces, useCreateInterface, useDeleteInterface } from "@/api/interfaces";
import { useLinks } from "@/api/links";
import { useVMs } from "@/api/virtual";
import { useLicenses } from "@/api/licenses";
import { useAuditLogs } from "@/api/auditLogs";
import { Modal } from "@/components/common/Modal";
import { FormField, Input, Textarea, Select } from "@/components/common/FormField";
import { Table } from "@/components/common/Table";
import { StatusBadge } from "@/components/common/Badge";
import { Spinner } from "@/components/common/Spinner";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { formatDate, formatDateTime, ucfirst } from "@/lib/utils";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import type { NetworkInterfaceRead, VMRead, LicenseRead, AuditLogRead } from "@/types";

const TABS = ["overview", "interfaces", "connections", "vms", "power", "licenses", "audit"];
const MEDIA_TYPES = ["copper_rj45","sfp","sfp_plus","sfp28","qsfp","qsfp_plus","qsfp28","fc","iscsi","dac"];

export default function DeviceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: device, isLoading } = useDevice(id!);
  const { data: interfaces } = useInterfaces({ device_id: id! });
  const { data: links } = useLinks({});
  const { data: vms } = useVMs({});
  const { data: licenses } = useLicenses({ device_id: id! });
  const { data: auditLogs } = useAuditLogs({ entity_type: "device", entity_id: id!, size: 50 });
  const { data: powerReadings } = useDevicePowerReadings(id!);

  const updateMut = useUpdateDevice(id!);
  const createIfaceMut = useCreateInterface();
  const deleteIfaceMut = useDeleteInterface();

  // Edit device modal
  const [editOpen, setEditOpen] = useState(false);
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editMgmtIp, setEditMgmtIp] = useState("");

  function openEdit() {
    setEditNotes(device?.notes ?? "");
    setEditStatus(device?.status ?? "active");
    setEditMgmtIp(device?.management_ip ?? "");
    setEditOpen(true);
  }

  // Add interface modal
  const [ifaceOpen, setIfaceOpen] = useState(false);
  const [ifaceForm, setIfaceForm] = useState({ name: "", media_type: "copper_rj45", speed_mbps: "", mac_address: "" });

  async function handleSaveDevice() {
    await updateMut.mutateAsync({ notes: editNotes || null, status: editStatus, management_ip: editMgmtIp || null });
    setEditOpen(false);
  }

  async function handleAddInterface() {
    await createIfaceMut.mutateAsync({
      device_id: id!, name: ifaceForm.name, media_type: ifaceForm.media_type,
      speed_mbps: ifaceForm.speed_mbps ? parseInt(ifaceForm.speed_mbps) : null,
      mac_address: ifaceForm.mac_address || null,
    });
    setIfaceOpen(false);
    setIfaceForm({ name: "", media_type: "copper_rj45", speed_mbps: "", mac_address: "" });
  }

  // Filter links involving this device's interfaces
  const myIfaceIds = new Set((interfaces?.items ?? []).map((i) => i.id));
  const myLinks = (links?.items ?? []).filter(
    (l) => myIfaceIds.has(l.source_interface_id) || myIfaceIds.has(l.target_interface_id)
  );

  const ifaceMap = Object.fromEntries((interfaces?.items ?? []).map((i) => [i.id, i.name]));

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
  if (!device) return <div className="text-gray-500">Device not found.</div>;

  return (
    <div className="space-y-4">
      <Breadcrumbs crumbs={[{ label: "Devices", to: "/devices" }, { label: device.name }]} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{device.name}</h1>
            <p className="text-sm text-gray-500">{device.device_type.replace(/_/g, " ")} · {device.manufacturer ?? ""} {device.model ?? ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={device.status} />
          <button onClick={openEdit} className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            <Pencil size={14} /> Edit
          </button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
        <Tabs.List className="flex border-b border-gray-200 gap-1">
          {TABS.map((tab) => (
            <Tabs.Trigger
              key={tab}
              value={tab}
              className="px-4 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-800 data-[state=active]:text-blue-600 data-[state=active]:border-b-2 data-[state=active]:border-blue-600 -mb-px capitalize"
            >
              {tab}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {/* Overview */}
        <Tabs.Content value="overview" className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-800 mb-3">Identity</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {[
                  ["Serial Number", device.serial_number],
                  ["Part Number", device.part_number],
                  ["Asset Tag", device.asset_tag],
                  ["Management IP", device.management_ip],
                  ["Management Protocol", device.management_protocol],
                  ["SSH Username", device.ssh_username],
                  ["Power (W)", device.power_rated_w?.toString()],
                  ["Last Synced", formatDateTime(device.last_synced_at)],
                  ["Last Seen", formatDateTime(device.last_seen_at)],
                ].map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-gray-500">{k}</dt>
                    <dd className="text-gray-900 font-medium truncate">{v ?? "—"}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-800 mb-3">Lifecycle</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {[
                  ["Purchase Date", formatDate(device.purchase_date)],
                  ["Warranty Expiry", formatDate(device.warranty_expiry)],
                  ["End of Support", formatDate(device.end_of_support_date)],
                  ["End of Life", formatDate(device.end_of_life_date)],
                  ["Created", formatDateTime(device.created_at)],
                  ["Updated", formatDateTime(device.updated_at)],
                ].map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-gray-500">{k}</dt>
                    <dd className="text-gray-900 font-medium">{v ?? "—"}</dd>
                  </div>
                ))}
              </dl>
              {device.notes && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-1">Notes</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{device.notes}</p>
                </div>
              )}
            </div>

            {/* Server detail */}
            {device.server_detail && (
              <div className="bg-white rounded-xl border border-gray-200 p-5 md:col-span-2">
                <h3 className="font-semibold text-gray-800 mb-3">Server Specs</h3>
                <dl className="grid grid-cols-3 gap-x-4 gap-y-2 text-sm">
                  {[
                    ["CPU Model", device.server_detail.cpu_model],
                    ["Sockets", device.server_detail.cpu_socket_count?.toString()],
                    ["Cores/Socket", device.server_detail.cpu_cores_per_socket?.toString()],
                    ["RAM (GB)", device.server_detail.ram_gb?.toString()],
                    ["RAM Max (GB)", device.server_detail.ram_max_gb?.toString()],
                    ["NICs", device.server_detail.nic_count?.toString()],
                    ["HBAs", device.server_detail.hba_count?.toString()],
                    ["BIOS", device.server_detail.bios_version],
                    ["BMC Firmware", device.server_detail.bmc_firmware_version],
                  ].map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-gray-500">{k}</dt>
                      <dd className="text-gray-900 font-medium">{v ?? "—"}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </Tabs.Content>

        {/* Interfaces */}
        <Tabs.Content value="interfaces" className="pt-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-gray-800">Network Interfaces</h3>
            <button onClick={() => setIfaceOpen(true)} className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              Add Interface
            </button>
          </div>
          <Table<NetworkInterfaceRead>
            data={interfaces?.items ?? []}
            rowKey={(r) => r.id}
            columns={[
              { key: "name", header: "Name" },
              { key: "media_type", header: "Media", render: (r) => r.media_type.replace(/_/g, " ") },
              { key: "speed_mbps", header: "Speed", render: (r) => r.speed_mbps ? `${r.speed_mbps} Mbps` : "—" },
              { key: "mac_address", header: "MAC", render: (r) => r.mac_address ?? "—" },
              { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
              {
                key: "actions", header: "",
                render: (r) => (
                  <button onClick={() => deleteIfaceMut.mutate(r.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded hover:bg-gray-100">
                    Delete
                  </button>
                ),
              },
            ]}
          />
        </Tabs.Content>

        {/* Connections */}
        <Tabs.Content value="connections" className="pt-4">
          <h3 className="font-semibold text-gray-800 mb-3">Network Links</h3>
          {myLinks.length === 0 ? (
            <p className="text-sm text-gray-400">No connections found for this device's interfaces.</p>
          ) : (
            <Table
              data={myLinks}
              rowKey={(r) => r.id}
              columns={[
                { key: "source", header: "Source Port", render: (r) => ifaceMap[r.source_interface_id] ?? r.source_interface_id.slice(0, 8) },
                { key: "target", header: "Target Port", render: (r) => ifaceMap[r.target_interface_id] ?? r.target_interface_id.slice(0, 8) },
                { key: "link_type", header: "Type", render: (r) => r.link_type.replace(/_/g, " ") },
                { key: "speed_mbps", header: "Speed", render: (r) => r.speed_mbps ? `${r.speed_mbps} Mbps` : "—" },
                { key: "cable_label", header: "Cable", render: (r) => r.cable_label ?? "—" },
                { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
              ]}
            />
          )}
        </Tabs.Content>

        {/* VMs */}
        <Tabs.Content value="vms" className="pt-4">
          <h3 className="font-semibold text-gray-800 mb-3">Virtual Machines</h3>
          <Table<VMRead>
            data={(vms?.items ?? []).slice(0, 20)}
            rowKey={(r) => r.id}
            emptyMessage="No VMs associated with this device."
            columns={[
              { key: "name", header: "Name" },
              { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
              { key: "os_type", header: "OS", render: (r) => r.os_type ?? "—" },
              { key: "vcpu_count", header: "vCPU", render: (r) => r.vcpu_count?.toString() ?? "—" },
              { key: "ram_gb", header: "RAM (GB)", render: (r) => r.ram_gb?.toString() ?? "—" },
            ]}
          />
        </Tabs.Content>

        {/* Power */}
        <Tabs.Content value="power" className="pt-4">
          <h3 className="font-semibold text-gray-800 mb-3">Power Readings</h3>
          {!powerReadings || powerReadings.length === 0 ? (
            <p className="text-sm text-gray-400">No power readings recorded.</p>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={powerReadings.slice(-48).map((r) => ({ t: new Date(r.recorded_at).toLocaleTimeString(), w: r.watts }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="t" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="W" />
                  <Tooltip formatter={(v) => [`${v}W`, "Power"]} />
                  <Line type="monotone" dataKey="w" stroke="#3b82f6" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Tabs.Content>

        {/* Licenses */}
        <Tabs.Content value="licenses" className="pt-4">
          <h3 className="font-semibold text-gray-800 mb-3">Licenses</h3>
          <Table<LicenseRead>
            data={licenses?.items ?? []}
            rowKey={(r) => r.id}
            emptyMessage="No licenses attached."
            columns={[
              { key: "product_name", header: "Product" },
              { key: "vendor", header: "Vendor", render: (r) => r.vendor ?? "—" },
              { key: "license_type", header: "Type", render: (r) => ucfirst(r.license_type) },
              { key: "quantity", header: "Qty", render: (r) => r.quantity?.toString() ?? "—" },
              { key: "expiry_date", header: "Expiry", render: (r) => formatDate(r.expiry_date) },
            ]}
          />
        </Tabs.Content>

        {/* Audit */}
        <Tabs.Content value="audit" className="pt-4">
          <h3 className="font-semibold text-gray-800 mb-3">Change History</h3>
          <Table<AuditLogRead>
            data={auditLogs?.items ?? []}
            rowKey={(r) => r.id}
            emptyMessage="No audit events."
            columns={[
              { key: "timestamp", header: "Time", render: (r) => formatDateTime(r.timestamp) },
              { key: "action", header: "Action", render: (r) => <StatusBadge status={r.action} /> },
              { key: "ip_address", header: "IP", render: (r) => r.ip_address ?? "—" },
              { key: "diff", header: "Changes", render: (r) => r.diff ? (
                <details className="cursor-pointer">
                  <summary className="text-xs text-blue-600">View diff</summary>
                  <pre className="mt-1 text-xs bg-gray-50 p-2 rounded max-w-xs overflow-auto">{JSON.stringify(r.diff, null, 2)}</pre>
                </details>
              ) : "—" },
            ]}
          />
        </Tabs.Content>
      </Tabs.Root>

      {/* Edit device modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Device">
        <div className="space-y-3">
          <FormField label="Status">
            <Select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
              {["active","inactive","maintenance","decommissioned","spare"].map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </FormField>
          <FormField label="Management IP"><Input value={editMgmtIp} onChange={(e) => setEditMgmtIp(e.target.value)} /></FormField>
          <FormField label="Notes"><Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} /></FormField>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setEditOpen(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={handleSaveDevice} disabled={updateMut.isPending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">Save</button>
          </div>
        </div>
      </Modal>

      {/* Add interface modal */}
      <Modal open={ifaceOpen} onClose={() => setIfaceOpen(false)} title="Add Interface">
        <div className="space-y-3">
          <FormField label="Name" required><Input value={ifaceForm.name} onChange={(e) => setIfaceForm((f) => ({ ...f, name: e.target.value }))} /></FormField>
          <FormField label="Media Type">
            <Select value={ifaceForm.media_type} onChange={(e) => setIfaceForm((f) => ({ ...f, media_type: e.target.value }))}>
              {MEDIA_TYPES.map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}
            </Select>
          </FormField>
          <FormField label="Speed (Mbps)"><Input type="number" value={ifaceForm.speed_mbps} onChange={(e) => setIfaceForm((f) => ({ ...f, speed_mbps: e.target.value }))} /></FormField>
          <FormField label="MAC Address"><Input value={ifaceForm.mac_address} onChange={(e) => setIfaceForm((f) => ({ ...f, mac_address: e.target.value }))} placeholder="AA:BB:CC:DD:EE:FF" /></FormField>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setIfaceOpen(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={handleAddInterface} disabled={createIfaceMut.isPending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">Add</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
