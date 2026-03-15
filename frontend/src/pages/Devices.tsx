import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Pencil, Trash2, ExternalLink, Server } from "lucide-react";
import {
  useDevices, useDevice, useCreateDevice, useUpdateDevice, useDeleteDevice,
  useChassisBlades,
} from "@/api/devices";
import api from "@/api/index";
import { useRacks } from "@/api/racks";
import { useCorridors } from "@/api/corridors";
import { useRooms } from "@/api/rooms";
import { useDataCenters } from "@/api/datacenters";
import { useDeviceTypes } from "@/api/deviceTypes";
import { Table } from "@/components/common/Table";
import { Modal } from "@/components/common/Modal";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FormField, Input, Textarea, Select } from "@/components/common/FormField";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/Badge";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { getDeviceFormConfig } from "@/lib/deviceFormConfig";
import type { DeviceRead } from "@/types";

const DEVICE_STATUS = ["active","inactive","maintenance","decommissioned","spare"];
const MGMT_PROTO = ["ipmi","idrac","ilo","xcc","snmp","ssh","api"];
const FORM_FACTORS = ["1u","2u","4u","tower","blade"];
const SNMP_VERSIONS = ["v1","v2c","v3"];
const OUTLET_TYPES = ["c13","c19","nema_5_15","nema_5_20","nema_l5_30","nema_l6_30","iec_60309"];
const SPANNING_TREE_MODES = ["stp","rstp","mstp","pvst","rapid_pvst"];

// Simple IPv4/v6 regex for client-side validation
const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$|^([0-9a-fA-F:]+:+[0-9a-fA-F]*)$/;

interface FormData {
  // Base fields
  rack_id: string; name: string; device_type: string; manufacturer: string; model: string;
  part_number: string; serial_number: string; asset_tag: string;
  rack_unit_start: string; rack_unit_size: string; face: string;
  power_rated_w: string; weight_kg: string; status: string; management_ip: string;
  management_protocol: string; snmp_community: string; snmp_version: string;
  ssh_username: string; ssh_password: string;
  purchase_date: string; warranty_expiry: string; end_of_support_date: string; end_of_life_date: string;
  notes: string;
}

interface ServerExtForm {
  form_factor: string; cpu_model: string; cpu_socket_count: string;
  cpu_cores_per_socket: string; cpu_threads_per_core: string;
  ram_gb: string; ram_max_gb: string; nic_count: string; hba_count: string;
  bios_version: string; bmc_firmware_version: string;
  // blade extension
  blade_chassis_id: string; blade_slot: string;
  // chassis capacity (blade_chassis device type only)
  total_blade_slots: string; ethernet_switch_modules: string; fc_switch_modules: string;
}

interface NetworkExtForm {
  os_type: string; os_version: string; port_count: string; uplink_port_count: string;
  management_vlan: string; spanning_tree_mode: string; spanning_tree_priority: string;
  stacking_enabled: boolean; stack_member_id: string; snmp_sysoid: string;
}

interface PduExtForm {
  outlet_count: string; outlet_type: string; input_voltage: string;
  input_current_max_a: string; is_metered: boolean; is_switched: boolean;
  current_load_w: string;
}

function emptyForm(rackId: string): FormData {
  return {
    rack_id: rackId, name: "", device_type: "server", manufacturer: "", model: "",
    part_number: "", serial_number: "", asset_tag: "",
    rack_unit_start: "", rack_unit_size: "1", face: "front",
    power_rated_w: "", weight_kg: "", status: "active", management_ip: "",
    management_protocol: "", snmp_community: "", snmp_version: "",
    ssh_username: "", ssh_password: "",
    purchase_date: "", warranty_expiry: "", end_of_support_date: "", end_of_life_date: "",
    notes: "",
  };
}

const emptyServerExt: ServerExtForm = {
  form_factor: "", cpu_model: "", cpu_socket_count: "", cpu_cores_per_socket: "",
  cpu_threads_per_core: "", ram_gb: "", ram_max_gb: "", nic_count: "", hba_count: "",
  bios_version: "", bmc_firmware_version: "", blade_chassis_id: "", blade_slot: "",
  total_blade_slots: "", ethernet_switch_modules: "", fc_switch_modules: "",
};

const emptyNetworkExt: NetworkExtForm = {
  os_type: "", os_version: "", port_count: "", uplink_port_count: "",
  management_vlan: "", spanning_tree_mode: "", spanning_tree_priority: "",
  stacking_enabled: false, stack_member_id: "", snmp_sysoid: "",
};

const emptyPduExt: PduExtForm = {
  outlet_count: "", outlet_type: "", input_voltage: "", input_current_max_a: "",
  is_metered: false, is_switched: false, current_load_w: "",
};

interface BladeFormData {
  name: string; slot: string; manufacturer: string; model: string;
  serial_number: string; status: string;
}
const emptyBladeForm: BladeFormData = {
  name: "", slot: "", manufacturer: "", model: "", serial_number: "", status: "active",
};

function ChassisBlades({ chassisId, totalSlots }: { chassisId: string; totalSlots?: number }) {
  const { data, refetch } = useChassisBlades(chassisId);
  const createMut = useCreateDevice();
  // Hook now returns DeviceDetailRead[] directly (not a Page wrapper)
  const blades = data ?? [];

  const [addOpen, setAddOpen] = useState(false);
  const [bladeForm, setBladeForm] = useState<BladeFormData>(emptyBladeForm);
  const [bladeError, setBladeError] = useState("");
  const [bladeSlotError, setBladeSlotError] = useState("");
  const [savingBlade, setSavingBlade] = useState(false);

  async function handleAddBlade() {
    setBladeError("");
    setBladeSlotError("");
    if (!bladeForm.name.trim()) { setBladeError("Name is required."); return; }
    if (!bladeForm.slot) { setBladeSlotError("Slot number is required."); return; }
    const slotNum = parseInt(bladeForm.slot);
    const slotTaken = blades.some((b) => b.server_detail?.blade_slot === slotNum);
    if (slotTaken) { setBladeSlotError(`Slot ${slotNum} is already occupied.`); return; }
    setSavingBlade(true);
    try {
      const created = await createMut.mutateAsync({
        name: bladeForm.name,
        device_type: "blade",
        manufacturer: bladeForm.manufacturer || null,
        model: bladeForm.model || null,
        serial_number: bladeForm.serial_number || null,
        status: bladeForm.status,
      }) as DeviceRead;
      await api.put(`/devices/${created.id}/server-detail`, {
        blade_chassis_id: chassisId,
        blade_slot: parseInt(bladeForm.slot),
      });
      setAddOpen(false);
      setBladeForm(emptyBladeForm);
      void refetch();
    } catch (e: unknown) {
      const det = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      setBladeError(
        typeof det === "string" ? det
          : Array.isArray(det) ? (det as { msg?: string }[]).map((d) => d.msg ?? "").join("; ")
          : "Failed to add blade."
      );
    } finally {
      setSavingBlade(false);
    }
  }

  const setB = (k: keyof BladeFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setBladeForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <Server size={14} /> Blade Slots ({blades.length}{totalSlots ? ` / ${totalSlots}` : ""})
        </h3>
        <button
          type="button"
          onClick={() => { setAddOpen(true); setBladeForm(emptyBladeForm); setBladeError(""); setBladeSlotError(""); }}
          className="flex items-center gap-1 text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
        >
          <Plus size={12} /> Add Blade
        </button>
      </div>

      {blades.length === 0 ? (
        <p className="text-xs text-gray-400">No blades installed.</p>
      ) : (
        <div className="space-y-1">
          {blades
            .slice()
            .sort((a, b) => {
              const slotA = a.server_detail?.blade_slot ?? 9999;
              const slotB = b.server_detail?.blade_slot ?? 9999;
              return slotA - slotB;
            })
            .map((blade) => (
              <div key={blade.id} className="flex items-center justify-between text-sm py-1.5 px-2 rounded bg-gray-50">
                <div className="flex items-center gap-2">
                  {blade.server_detail?.blade_slot != null && (
                    <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold bg-gray-200 text-gray-600 rounded">
                      {blade.server_detail.blade_slot}
                    </span>
                  )}
                  <span className="font-medium text-gray-800">{blade.name}</span>
                </div>
                <div className="flex items-center gap-3 text-gray-500">
                  {blade.manufacturer && <span className="text-xs">{blade.manufacturer} {blade.model}</span>}
                  <StatusBadge status={blade.status} />
                </div>
              </div>
            ))}
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Blade" size="sm">
        <div className="space-y-3">
          {bladeError && <p className="text-sm text-red-500">{bladeError}</p>}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Blade Name" required>
              <Input value={bladeForm.name} onChange={setB("name")} placeholder="blade-01" />
            </FormField>
            <FormField label="Slot #" required error={bladeSlotError}>
              <Input type="number" min="1" value={bladeForm.slot} onChange={(e) => { setBladeSlotError(""); setB("slot")(e); }} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Manufacturer">
              <Input value={bladeForm.manufacturer} onChange={setB("manufacturer")} />
            </FormField>
            <FormField label="Model">
              <Input value={bladeForm.model} onChange={setB("model")} />
            </FormField>
          </div>
          <FormField label="Serial Number">
            <Input value={bladeForm.serial_number} onChange={setB("serial_number")} />
          </FormField>
          <FormField label="Status">
            <Select value={bladeForm.status} onChange={setB("status")}>
              {DEVICE_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </FormField>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setAddOpen(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={handleAddBlade} disabled={savingBlade} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
              {savingBlade ? "Adding…" : "Add Blade"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function Devices() {
  const [searchParams] = useSearchParams();
  const rackFilter = searchParams.get("rack_id") ?? undefined;
  const corridorIdParam = searchParams.get("corridor_id") ?? undefined;
  const roomIdParam = searchParams.get("room_id") ?? undefined;
  const dcIdParam = searchParams.get("datacenter_id") ?? undefined;
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("");

  const params: Record<string, unknown> = { page, size: 50 };
  if (rackFilter) params.rack_id = rackFilter;
  if (typeFilter) params.device_type = typeFilter;

  const { data, isLoading } = useDevices(params);
  const { data: deviceTypeList } = useDeviceTypes();
  const deviceTypes = deviceTypeList ?? [];
  const { data: rackData } = useRacks({ page: 1, size: 200 });
  const { data: corridorData } = useCorridors({ page: 1, size: 200 });
  const { data: roomData } = useRooms({ page: 1, size: 200 });
  const { data: dcData } = useDataCenters(1, 200);
  // Fetch blade chassis for blade extension dropdown
  const { data: chassisData } = useDevices({ page: 1, size: 200, device_type: "blade_chassis", status: "active" });
  const rackList = rackData?.items ?? [];
  const rackMap = Object.fromEntries(rackList.map((r) => [r.id, r.name]));
  const corridorMap = Object.fromEntries((corridorData?.items ?? []).map((c) => [c.id, c]));
  const roomMap = Object.fromEntries((roomData?.items ?? []).map((r) => [r.id, r]));
  const dcMap = Object.fromEntries((dcData?.items ?? []).map((d) => [d.id, d.name]));
  const chassisList = chassisData?.items ?? [];

  const createMut = useCreateDevice();
  const deleteMut = useDeleteDevice();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DeviceRead | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm(rackFilter ?? ""));
  const [serverExt, setServerExt] = useState<ServerExtForm>(emptyServerExt);
  const [networkExt, setNetworkExt] = useState<NetworkExtForm>(emptyNetworkExt);
  const [pduExt, setPduExt] = useState<PduExtForm>(emptyPduExt);
  const [deleteTarget, setDeleteTarget] = useState<DeviceRead | null>(null);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const updateMut = useUpdateDevice(editing?.id ?? "");

  // Fetch full detail (with extension tables) for the device being edited
  const { data: editingDetail } = useDevice(editing?.id ?? "");

  // Populate extension forms once detail loads
  useEffect(() => {
    if (!editingDetail || !modalOpen) return;
    const s = editingDetail.server_detail;
    if (s) {
      setServerExt({
        form_factor: s.form_factor ?? "",
        cpu_model: s.cpu_model ?? "",
        cpu_socket_count: s.cpu_socket_count != null ? String(s.cpu_socket_count) : "",
        cpu_cores_per_socket: s.cpu_cores_per_socket != null ? String(s.cpu_cores_per_socket) : "",
        cpu_threads_per_core: s.cpu_threads_per_core != null ? String(s.cpu_threads_per_core) : "",
        ram_gb: s.ram_gb != null ? String(s.ram_gb) : "",
        ram_max_gb: s.ram_max_gb != null ? String(s.ram_max_gb) : "",
        nic_count: s.nic_count != null ? String(s.nic_count) : "",
        hba_count: s.hba_count != null ? String(s.hba_count) : "",
        bios_version: s.bios_version ?? "",
        bmc_firmware_version: s.bmc_firmware_version ?? "",
        blade_chassis_id: s.blade_chassis_id != null ? String(s.blade_chassis_id) : "",
        blade_slot: s.blade_slot != null ? String(s.blade_slot) : "",
        total_blade_slots: s.total_blade_slots != null ? String(s.total_blade_slots) : "",
        ethernet_switch_modules: s.ethernet_switch_modules != null ? String(s.ethernet_switch_modules) : "",
        fc_switch_modules: s.fc_switch_modules != null ? String(s.fc_switch_modules) : "",
      });
    }
    const n = editingDetail.network_detail;
    if (n) {
      setNetworkExt({
        os_type: n.os_type ?? "",
        os_version: n.os_version ?? "",
        port_count: n.port_count != null ? String(n.port_count) : "",
        uplink_port_count: n.uplink_port_count != null ? String(n.uplink_port_count) : "",
        management_vlan: n.management_vlan != null ? String(n.management_vlan) : "",
        spanning_tree_mode: n.spanning_tree_mode ?? "",
        spanning_tree_priority: n.spanning_tree_priority != null ? String(n.spanning_tree_priority) : "",
        stacking_enabled: n.stacking_enabled ?? false,
        stack_member_id: n.stack_member_id != null ? String(n.stack_member_id) : "",
        snmp_sysoid: n.snmp_sysoid ?? "",
      });
    }
    const p = editingDetail.pdu_detail;
    if (p) {
      setPduExt({
        outlet_count: p.outlet_count != null ? String(p.outlet_count) : "",
        outlet_type: p.outlet_type ?? "",
        input_voltage: p.input_voltage != null ? String(p.input_voltage) : "",
        input_current_max_a: p.input_current_max_a != null ? String(p.input_current_max_a) : "",
        is_metered: p.is_metered ?? false,
        is_switched: p.is_switched ?? false,
        current_load_w: p.current_load_w != null ? String(p.current_load_w) : "",
      });
    }
  }, [editingDetail, modalOpen]);

  // Derive config from current device_type
  const cfg = useMemo(() => getDeviceFormConfig(form.device_type), [form.device_type]);

  // Fetch blades already in the selected chassis so slot conflicts can be detected
  const { data: chassisBlades } = useChassisBlades(
    cfg.showBladeExtension && serverExt.blade_chassis_id ? serverExt.blade_chassis_id : null
  );

  function openCreate() {
    setEditing(null);
    setForm(emptyForm(rackFilter ?? ""));
    setServerExt(emptyServerExt);
    setNetworkExt(emptyNetworkExt);
    setPduExt(emptyPduExt);
    setError("");
    setFieldErrors({});
    setModalOpen(true);
  }

  function openEdit(d: DeviceRead) {
    const next: FormData = {
      rack_id: d.rack_id ?? "",
      name: d.name,
      device_type: d.device_type,
      manufacturer: d.manufacturer ?? "",
      model: d.model ?? "",
      part_number: d.part_number ?? "",
      serial_number: d.serial_number ?? "",
      asset_tag: d.asset_tag ?? "",
      rack_unit_start: d.rack_unit_start != null ? String(d.rack_unit_start) : "",
      rack_unit_size: d.rack_unit_size != null ? String(d.rack_unit_size) : "1",
      face: d.face ?? "front",
      power_rated_w: d.power_rated_w != null ? String(d.power_rated_w) : "",
      weight_kg: (d as unknown as Record<string, unknown>).weight_kg != null
        ? String((d as unknown as Record<string, unknown>).weight_kg) : "",
      status: d.status,
      management_ip: d.management_ip ?? "",
      management_protocol: d.management_protocol ?? "",
      snmp_community: (d as unknown as Record<string, unknown>).snmp_community as string ?? "",
      snmp_version: (d as unknown as Record<string, unknown>).snmp_version as string ?? "",
      ssh_username: d.ssh_username ?? "",
      ssh_password: "",
      purchase_date: (d as unknown as Record<string, unknown>).purchase_date as string ?? "",
      warranty_expiry: d.warranty_expiry ?? "",
      end_of_support_date: (d as unknown as Record<string, unknown>).end_of_support_date as string ?? "",
      end_of_life_date: d.end_of_life_date ?? "",
      notes: d.notes ?? "",
    };
    setEditing(d);
    setForm(next);
    setServerExt(emptyServerExt);
    setNetworkExt(emptyNetworkExt);
    setPduExt(emptyPduExt);
    setError("");
    setFieldErrors({});
    setModalOpen(true);
  }

  function handleDeviceTypeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newType = e.target.value;
    setForm((f) => ({ ...f, device_type: newType }));
    // Reset extension forms when switching device type
    setServerExt(emptyServerExt);
    setNetworkExt(emptyNetworkExt);
    setPduExt(emptyPduExt);
    setFieldErrors({});
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (form.management_ip && !IP_RE.test(form.management_ip)) {
      errs.management_ip = "Must be a valid IPv4 or IPv6 address";
    }
    if (cfg.showRackPlacement && cfg.rackPlacementRequired && form.rack_id && !form.rack_unit_start) {
      errs.rack_unit_start = "Required when rack is selected";
    }
    if (cfg.showBladeExtension) {
      if (!serverExt.blade_chassis_id) errs.blade_chassis_id = "Required for blade devices";
      if (!serverExt.blade_slot) {
        errs.blade_slot = "Required for blade devices";
      } else {
        const slotNum = parseInt(serverExt.blade_slot);
        const slotTaken = (chassisBlades ?? []).some(
          (b) => b.server_detail?.blade_slot === slotNum && b.id !== editing?.id
        );
        if (slotTaken) errs.blade_slot = `Slot ${slotNum} is already occupied in this chassis`;
      }
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function toBody(f: FormData) {
    const body: Record<string, unknown> = {
      name: f.name,
      device_type: f.device_type,
      manufacturer: f.manufacturer || null,
      model: f.model || null,
      part_number: f.part_number || null,
      serial_number: f.serial_number || null,
      asset_tag: f.asset_tag || null,
      status: f.status,
      notes: f.notes || null,
    };

    if (cfg.showRackPlacement) {
      body.rack_id = f.rack_id || null;
      body.rack_unit_start = f.rack_unit_start ? parseInt(f.rack_unit_start) : null;
      body.rack_unit_size = f.rack_unit_size ? parseInt(f.rack_unit_size) : null;
      body.face = f.face || null;
    }

    if (cfg.showPowerPhysical) {
      body.power_rated_w = f.power_rated_w ? parseInt(f.power_rated_w) : null;
      body.weight_kg = f.weight_kg ? parseFloat(f.weight_kg) : null;
    }

    if (cfg.showLifecycleDates) {
      body.purchase_date = f.purchase_date || null;
      body.warranty_expiry = f.warranty_expiry || null;
      body.end_of_support_date = f.end_of_support_date || null;
      body.end_of_life_date = f.end_of_life_date || null;
    }

    if (cfg.showManagementIp) {
      body.management_ip = f.management_ip || null;
      body.management_protocol = f.management_protocol || null;
    }

    if (cfg.showSnmp) {
      body.snmp_community = f.snmp_community || null;
      body.snmp_version = f.snmp_version || null;
    }

    if (cfg.showSsh) {
      body.ssh_username = f.ssh_username || null;
      body.ssh_password = f.ssh_password || undefined;
    }

    return body;
  }

  function toServerExtBody(): Record<string, unknown> | null {
    if (!cfg.showServerExtension && !cfg.showBladeExtension) return null;
    const b: Record<string, unknown> = {
      form_factor: serverExt.form_factor || null,
      cpu_model: serverExt.cpu_model || null,
      cpu_socket_count: serverExt.cpu_socket_count ? parseInt(serverExt.cpu_socket_count) : null,
      cpu_cores_per_socket: serverExt.cpu_cores_per_socket ? parseInt(serverExt.cpu_cores_per_socket) : null,
      cpu_threads_per_core: serverExt.cpu_threads_per_core ? parseInt(serverExt.cpu_threads_per_core) : null,
      ram_gb: serverExt.ram_gb ? parseInt(serverExt.ram_gb) : null,
      ram_max_gb: serverExt.ram_max_gb ? parseInt(serverExt.ram_max_gb) : null,
      nic_count: serverExt.nic_count ? parseInt(serverExt.nic_count) : null,
      hba_count: serverExt.hba_count ? parseInt(serverExt.hba_count) : null,
      bios_version: serverExt.bios_version || null,
      bmc_firmware_version: serverExt.bmc_firmware_version || null,
    };
    if (cfg.showBladeExtension) {
      b.blade_chassis_id = serverExt.blade_chassis_id || null;
      b.blade_slot = serverExt.blade_slot ? parseInt(serverExt.blade_slot) : null;
    }
    if (form.device_type === "blade_chassis") {
      b.total_blade_slots = serverExt.total_blade_slots ? parseInt(serverExt.total_blade_slots) : null;
      b.ethernet_switch_modules = serverExt.ethernet_switch_modules !== "" ? parseInt(serverExt.ethernet_switch_modules) : null;
      b.fc_switch_modules = serverExt.fc_switch_modules !== "" ? parseInt(serverExt.fc_switch_modules) : null;
    }
    return b;
  }

  function toNetworkExtBody(): Record<string, unknown> | null {
    if (!cfg.showNetworkExtension) return null;
    return {
      os_type: networkExt.os_type || null,
      os_version: networkExt.os_version || null,
      port_count: networkExt.port_count ? parseInt(networkExt.port_count) : null,
      uplink_port_count: networkExt.uplink_port_count ? parseInt(networkExt.uplink_port_count) : null,
      management_vlan: networkExt.management_vlan ? parseInt(networkExt.management_vlan) : null,
      spanning_tree_mode: networkExt.spanning_tree_mode || null,
      spanning_tree_priority: networkExt.spanning_tree_priority ? parseInt(networkExt.spanning_tree_priority) : null,
      stacking_enabled: networkExt.stacking_enabled,
      stack_member_id: networkExt.stack_member_id ? parseInt(networkExt.stack_member_id) : null,
      snmp_sysoid: networkExt.snmp_sysoid || null,
    };
  }

  function toPduExtBody(): Record<string, unknown> | null {
    if (!cfg.showPduExtension) return null;
    return {
      outlet_count: pduExt.outlet_count ? parseInt(pduExt.outlet_count) : null,
      outlet_type: pduExt.outlet_type || null,
      input_voltage: pduExt.input_voltage ? parseInt(pduExt.input_voltage) : null,
      input_current_max_a: pduExt.input_current_max_a ? parseFloat(pduExt.input_current_max_a) : null,
      is_metered: pduExt.is_metered,
      is_switched: pduExt.is_switched,
      current_load_w: pduExt.current_load_w ? parseInt(pduExt.current_load_w) : null,
    };
  }

  async function handleSave() {
    setError("");
    if (!form.name.trim()) { setError("Name is required."); return; }
    if (!validate()) return;
    try {
      let deviceId: string;
      if (editing) {
        await updateMut.mutateAsync(toBody(form));
        deviceId = editing.id;
      } else {
        const created = await createMut.mutateAsync(toBody(form)) as { id: string };
        deviceId = created.id;
      }
      // Save extension tables in parallel if applicable
      const extSaves: Promise<unknown>[] = [];
      const srvBody = toServerExtBody();
      if (srvBody) extSaves.push(api.put(`/devices/${deviceId}/server-detail`, srvBody));
      const netBody = toNetworkExtBody();
      if (netBody) extSaves.push(api.put(`/devices/${deviceId}/network-detail`, netBody));
      const pduBody = toPduExtBody();
      if (pduBody) extSaves.push(api.put(`/devices/${deviceId}/pdu-detail`, pduBody));
      if (extSaves.length) await Promise.all(extSaves);
      setModalOpen(false);
    } catch (e: unknown) {
      const det = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      setError(
        typeof det === "string" ? det
          : Array.isArray(det) ? (det as { msg?: string }[]).map((d) => d.msg ?? "").join("; ")
          : "Save failed."
      );
    }
  }

  const set = (k: keyof FormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const setSrv = (k: keyof ServerExtForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setServerExt((f) => ({ ...f, [k]: e.target.value }));

  const setNet = (k: keyof NetworkExtForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setNetworkExt((f) => ({ ...f, [k]: e.target.value }));

  const setNetBool = (k: keyof NetworkExtForm) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setNetworkExt((f) => ({ ...f, [k]: e.target.checked }));

  const setPdu = (k: keyof PduExtForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setPduExt((f) => ({ ...f, [k]: e.target.value }));

  const setPduBool = (k: keyof PduExtForm) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setPduExt((f) => ({ ...f, [k]: e.target.checked }));

  const rackName = rackFilter ? rackMap[rackFilter] : null;
  const isChassis = form.device_type === "blade_chassis";

  const corridor = corridorIdParam ? corridorMap[corridorIdParam] : null;
  const corridorName = corridor?.name;
  const room = roomIdParam ? roomMap[roomIdParam] : null;
  const roomName = room?.name;
  const dcId = dcIdParam || undefined;
  const dcName = dcId ? dcMap[dcId] : null;

  const crumbs = rackName
    ? [
        { label: "Data Centers", to: "/datacenters" },
        ...(dcName && dcId ? [{ label: dcName, to: `/rooms?datacenter_id=${dcId}` }] : []),
        ...(roomName && roomIdParam ? [{ label: roomName, to: `/corridors?room_id=${roomIdParam}&datacenter_id=${dcId ?? ""}` }] : []),
        ...(corridorName && corridorIdParam ? [{ label: corridorName, to: `/racks?corridor_id=${corridorIdParam}&room_id=${roomIdParam ?? ""}&datacenter_id=${dcId ?? ""}` }] : []),
        { label: rackName },
        { label: "Devices" },
      ]
    : [{ label: "Devices" }];

  const fieldErrCls = "mt-1 text-xs text-red-500";

  return (
    <div className="space-y-4">
      <Breadcrumbs crumbs={crumbs} />
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Devices</h1>
        <div className="flex items-center gap-3">
          <Select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="text-sm">
            <option value="">All types</option>
            {deviceTypes.map((t) => <option key={t.name} value={t.name}>{t.label}</option>)}
          </Select>
          <button type="button" onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
            <Plus size={16} /> Add Device
          </button>
        </div>
      </div>

      <Table<DeviceRead>
        loading={isLoading}
        data={data?.items ?? []}
        rowKey={(r) => r.id}
        columns={[
          { key: "name", header: "Name", render: (r) => (
            <button type="button" onClick={() => navigate(`/devices/${r.id}`)} className="text-blue-600 hover:underline font-medium flex items-center gap-1">
              {r.name} <ExternalLink size={12} />
            </button>
          )},
          { key: "device_type", header: "Type", render: (r) => r.device_type.replace(/_/g, " ") },
          { key: "manufacturer", header: "Manufacturer", render: (r) => [r.manufacturer, r.model].filter(Boolean).join(" ") || "—" },
          { key: "rack", header: "Rack", render: (r) => r.rack_id ? (rackMap[r.rack_id] ?? "—") : "—" },
          { key: "rack_unit_start", header: "U", render: (r) => r.rack_unit_start?.toString() ?? "—" },
          { key: "management_ip", header: "Mgmt IP", render: (r) => r.management_ip ?? "—" },
          { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
          {
            key: "actions", header: "",
            render: (r) => (
              <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); openEdit(r); }}
                  className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600"
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget(r); }}
                  className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ),
          },
        ]}
      />
      <Pagination page={page} size={50} total={data?.total ?? 0} onChange={setPage} />

      {/* Device create/edit modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Device" : "New Device"} size="xl">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {error && <p className="text-sm text-red-500">{error}</p>}

          {/* ── Identity ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Name" required><Input value={form.name} onChange={set("name")} /></FormField>
            <FormField label="Device Type" required>
              <Select value={form.device_type} onChange={handleDeviceTypeChange}>
                {deviceTypes.map((t) => <option key={t.name} value={t.name}>{t.label}</option>)}
              </Select>
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Manufacturer"><Input value={form.manufacturer} onChange={set("manufacturer")} /></FormField>
            <FormField label="Model"><Input value={form.model} onChange={set("model")} /></FormField>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Serial Number"><Input value={form.serial_number} onChange={set("serial_number")} /></FormField>
            <FormField label="Part Number"><Input value={form.part_number} onChange={set("part_number")} /></FormField>
            <FormField label="Asset Tag"><Input value={form.asset_tag} onChange={set("asset_tag")} /></FormField>
          </div>
          <FormField label="Status">
            <Select value={form.status} onChange={set("status")}>
              {DEVICE_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </FormField>

          {/* ── Rack Placement ───────────────────────────────────────────── */}
          {cfg.showRackPlacement && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Rack Placement</p>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Rack">
                  <Select value={form.rack_id} onChange={set("rack_id")}>
                    <option value="">None</option>
                    {rackList.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </Select>
                </FormField>
                <div className="grid grid-cols-3 gap-2">
                  <FormField label="Unit Start">
                    <Input type="number" min="1" value={form.rack_unit_start} onChange={set("rack_unit_start")} />
                    {fieldErrors.rack_unit_start && <p className={fieldErrCls}>{fieldErrors.rack_unit_start}</p>}
                  </FormField>
                  <FormField label="U Size"><Input type="number" min="1" value={form.rack_unit_size} onChange={set("rack_unit_size")} /></FormField>
                  <FormField label="Face">
                    <Select value={form.face} onChange={set("face")}>
                      <option value="front">Front</option><option value="rear">Rear</option>
                    </Select>
                  </FormField>
                </div>
              </div>
            </div>
          )}

          {/* ── Power & Physical ─────────────────────────────────────────── */}
          {cfg.showPowerPhysical && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Power & Physical</p>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Power Rated (W)"><Input type="number" min="0" value={form.power_rated_w} onChange={set("power_rated_w")} /></FormField>
                <FormField label="Weight (kg)"><Input type="number" step="0.1" min="0" value={form.weight_kg} onChange={set("weight_kg")} /></FormField>
              </div>
            </div>
          )}

          {/* ── Lifecycle Dates ──────────────────────────────────────────── */}
          {cfg.showLifecycleDates && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Lifecycle Dates</p>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Purchase Date"><Input type="date" value={form.purchase_date} onChange={set("purchase_date")} /></FormField>
                <FormField label="Warranty Expiry"><Input type="date" value={form.warranty_expiry} onChange={set("warranty_expiry")} /></FormField>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <FormField label="End of Support"><Input type="date" value={form.end_of_support_date} onChange={set("end_of_support_date")} /></FormField>
                <FormField label="End of Life"><Input type="date" value={form.end_of_life_date} onChange={set("end_of_life_date")} /></FormField>
              </div>
            </div>
          )}

          {/* ── Management ───────────────────────────────────────────────── */}
          {cfg.showManagementIp && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Management</p>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Management IP">
                  <Input
                    value={form.management_ip}
                    onChange={set("management_ip")}
                    placeholder="192.168.1.100"
                  />
                  {fieldErrors.management_ip && <p className={fieldErrCls}>{fieldErrors.management_ip}</p>}
                </FormField>
                <FormField label="Management Protocol">
                  <Select value={form.management_protocol} onChange={set("management_protocol")}>
                    <option value="">None</option>
                    {MGMT_PROTO.map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                  </Select>
                </FormField>
              </div>

              {/* SNMP — only shown when showSnmp is also true */}
              {cfg.showSnmp && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <FormField label="SNMP Community"><Input value={form.snmp_community} onChange={set("snmp_community")} placeholder="public" /></FormField>
                  <FormField label="SNMP Version">
                    <Select value={form.snmp_version} onChange={set("snmp_version")}>
                      <option value="">None</option>
                      {SNMP_VERSIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                    </Select>
                  </FormField>
                </div>
              )}
            </div>
          )}

          {/* ── SSH ──────────────────────────────────────────────────────── */}
          {cfg.showSsh && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">SSH</p>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="SSH Username"><Input value={form.ssh_username} onChange={set("ssh_username")} /></FormField>
                <FormField label="SSH Password">
                  <Input type="password" value={form.ssh_password} onChange={set("ssh_password")} autoComplete="new-password"
                    placeholder={editing ? "(leave blank to keep existing)" : ""} />
                </FormField>
              </div>
            </div>
          )}

          {/* ── Server Extension ─────────────────────────────────────────── */}
          {cfg.showServerExtension && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Server Details</p>
              {form.device_type !== "blade" && (
                <FormField label="Form Factor" className="mb-3">
                  <Select value={serverExt.form_factor} onChange={setSrv("form_factor")}>
                    <option value="">Unknown</option>
                    {FORM_FACTORS.filter(f => f !== "blade").map((f) => <option key={f} value={f}>{f}</option>)}
                  </Select>
                </FormField>
              )}
              <FormField label="CPU Model" className="mb-3">
                <Input value={serverExt.cpu_model} onChange={setSrv("cpu_model")} placeholder="e.g. Intel Xeon Gold 6338" />
              </FormField>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <FormField label="Sockets"><Input type="number" min="1" value={serverExt.cpu_socket_count} onChange={setSrv("cpu_socket_count")} /></FormField>
                <FormField label="Cores/Socket"><Input type="number" min="1" value={serverExt.cpu_cores_per_socket} onChange={setSrv("cpu_cores_per_socket")} /></FormField>
                <FormField label="Threads/Core"><Input type="number" min="1" value={serverExt.cpu_threads_per_core} onChange={setSrv("cpu_threads_per_core")} /></FormField>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <FormField label="RAM (GB)"><Input type="number" min="1" value={serverExt.ram_gb} onChange={setSrv("ram_gb")} /></FormField>
                <FormField label="Max RAM (GB)"><Input type="number" min="1" value={serverExt.ram_max_gb} onChange={setSrv("ram_max_gb")} /></FormField>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <FormField label="NIC Count"><Input type="number" min="0" value={serverExt.nic_count} onChange={setSrv("nic_count")} /></FormField>
                <FormField label="HBA Count"><Input type="number" min="0" value={serverExt.hba_count} onChange={setSrv("hba_count")} /></FormField>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="BIOS Version"><Input value={serverExt.bios_version} onChange={setSrv("bios_version")} /></FormField>
                <FormField label="BMC Firmware"><Input value={serverExt.bmc_firmware_version} onChange={setSrv("bmc_firmware_version")} /></FormField>
              </div>
              {form.device_type === "blade_chassis" && (
                <div className="border-t border-gray-100 pt-3 mt-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Chassis Capacity</p>
                  <div className="grid grid-cols-3 gap-3">
                    <FormField label="Total Blade Slots">
                      <Input type="number" min="1" value={serverExt.total_blade_slots} onChange={setSrv("total_blade_slots")} placeholder="e.g. 16" />
                    </FormField>
                    <FormField label="Ethernet Switch Modules">
                      <Input type="number" min="0" value={serverExt.ethernet_switch_modules} onChange={setSrv("ethernet_switch_modules")} placeholder="0" />
                    </FormField>
                    <FormField label="FC Switch Modules">
                      <Input type="number" min="0" value={serverExt.fc_switch_modules} onChange={setSrv("fc_switch_modules")} placeholder="0" />
                    </FormField>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Blade Placement ──────────────────────────────────────────── */}
          {cfg.showBladeExtension && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Blade Placement</p>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Chassis" required>
                  <Select value={serverExt.blade_chassis_id} onChange={setSrv("blade_chassis_id")}>
                    <option value="">Select chassis…</option>
                    {chassisList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                  {fieldErrors.blade_chassis_id && <p className={fieldErrCls}>{fieldErrors.blade_chassis_id}</p>}
                </FormField>
                <FormField label="Position in Chassis (Slot #)" required error={fieldErrors.blade_slot}>
                  <Input type="number" min="1" value={serverExt.blade_slot} onChange={setSrv("blade_slot")} placeholder="e.g. 3" />
                </FormField>
              </div>
            </div>
          )}

          {/* ── Network Extension ────────────────────────────────────────── */}
          {cfg.showNetworkExtension && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Network Details</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <FormField label="OS Type"><Input value={networkExt.os_type} onChange={setNet("os_type")} placeholder="e.g. IOS, JunOS" /></FormField>
                <FormField label="OS Version"><Input value={networkExt.os_version} onChange={setNet("os_version")} /></FormField>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <FormField label="Port Count"><Input type="number" min="1" value={networkExt.port_count} onChange={setNet("port_count")} /></FormField>
                <FormField label="Uplink Ports"><Input type="number" min="0" value={networkExt.uplink_port_count} onChange={setNet("uplink_port_count")} /></FormField>
                <FormField label="Mgmt VLAN"><Input type="number" min="1" max="4094" value={networkExt.management_vlan} onChange={setNet("management_vlan")} /></FormField>
              </div>
              <FormField label="SNMP SysOID" className="mb-3">
                <Input value={networkExt.snmp_sysoid} onChange={setNet("snmp_sysoid")} />
              </FormField>
              {cfg.showSpanningTree && (
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <FormField label="STP Mode">
                    <Select value={networkExt.spanning_tree_mode} onChange={setNet("spanning_tree_mode")}>
                      <option value="">None</option>
                      {SPANNING_TREE_MODES.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
                    </Select>
                  </FormField>
                  <FormField label="STP Priority (0–61440)">
                    <Input type="number" min="0" max="61440" step="4096" value={networkExt.spanning_tree_priority} onChange={setNet("spanning_tree_priority")} />
                  </FormField>
                </div>
              )}
              {cfg.showStacking && (
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Stacking Enabled">
                    <label className="flex items-center gap-2 mt-1">
                      <input type="checkbox" checked={networkExt.stacking_enabled} onChange={setNetBool("stacking_enabled")} className="rounded" />
                      <span className="text-sm text-gray-700">Enabled</span>
                    </label>
                  </FormField>
                  {networkExt.stacking_enabled && (
                    <FormField label="Stack Member ID">
                      <Input type="number" min="0" value={networkExt.stack_member_id} onChange={setNet("stack_member_id")} />
                    </FormField>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── PDU Extension ────────────────────────────────────────────── */}
          {cfg.showPduExtension && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">PDU Details</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <FormField label="Outlet Count" required>
                  <Input type="number" min="1" value={pduExt.outlet_count} onChange={setPdu("outlet_count")} />
                </FormField>
                <FormField label="Outlet Type">
                  <Select value={pduExt.outlet_type} onChange={setPdu("outlet_type")}>
                    <option value="">Unknown</option>
                    {OUTLET_TYPES.map((o) => <option key={o} value={o}>{o.toUpperCase().replace(/_/g, "-")}</option>)}
                  </Select>
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <FormField label="Input Voltage (V)">
                  <Input type="number" min="100" max="480" value={pduExt.input_voltage} onChange={setPdu("input_voltage")} />
                </FormField>
                <FormField label="Max Current (A)">
                  <Input type="number" min="0" step="0.1" value={pduExt.input_current_max_a} onChange={setPdu("input_current_max_a")} />
                </FormField>
              </div>
              <FormField label="Current Load (W)" className="mb-3">
                <Input type="number" min="0" value={pduExt.current_load_w} onChange={setPdu("current_load_w")} />
              </FormField>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={pduExt.is_metered} onChange={setPduBool("is_metered")} className="rounded" />
                  Metered
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={pduExt.is_switched} onChange={setPduBool("is_switched")} className="rounded" />
                  Switched
                </label>
              </div>
            </div>
          )}

          {/* ── Notes ────────────────────────────────────────────────────── */}
          <div className="border-t border-gray-100 pt-3">
            <FormField label="Notes"><Textarea value={form.notes} onChange={set("notes")} /></FormField>
          </div>

          {/* Blade management — shown when editing an existing blade_chassis device */}
          {isChassis && editing && (
            <ChassisBlades
              chassisId={editing.id}
              totalSlots={serverExt.total_blade_slots ? parseInt(serverExt.total_blade_slots) : undefined}
            />
          )}
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 mt-4">
          <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button type="button" onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
            {editing ? "Save Changes" : "Create"}
          </button>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteTarget}
        onConfirm={async () => { await deleteMut.mutateAsync(deleteTarget!.id); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
        title="Delete Device"
        description={`"${deleteTarget?.name}" will be marked inactive (soft delete). Data is preserved.`}
        confirmLabel="Delete" danger />
    </div>
  );
}
