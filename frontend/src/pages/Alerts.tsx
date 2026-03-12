import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCheck, AlertTriangle, Info, Zap } from "lucide-react";
import { useAlerts, useAcknowledgeAlert } from "@/api/alerts";
import { Table } from "@/components/common/Table";
import { SeverityBadge } from "@/components/common/Badge";
import { Pagination } from "@/components/common/Pagination";
import { Select } from "@/components/common/FormField";
import { formatDateTime } from "@/lib/utils";
import type { AlertRead } from "@/types";

const SEVERITY_OPTIONS = ["", "critical", "warning", "info"];
const TYPE_OPTIONS = ["","device_eol","device_eos","license_expiry","warranty_expiry","power_capacity","sync_failure","device_unreachable","other"];

export default function Alerts() {
  const [page, setPage] = useState(1);
  const [severity, setSeverity] = useState("");
  const [alertType, setAlertType] = useState("");
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const navigate = useNavigate();

  const { data, isLoading } = useAlerts({
    severity: severity || undefined,
    alert_type: alertType || undefined,
    acknowledged: showAcknowledged ? undefined : false,
    page, size: 50,
  });

  const ackMut = useAcknowledgeAlert();

  function getAlertIcon(type: string) {
    if (type === "power_capacity") return <Zap size={14} className="text-orange-500" />;
    if (type.includes("eol") || type.includes("eos") || type.includes("expiry")) return <AlertTriangle size={14} className="text-yellow-500" />;
    return <Info size={14} className="text-blue-400" />;
  }

  function entityLink(alert: AlertRead) {
    if (!alert.entity_type || !alert.entity_id) return null;
    const routes: Record<string, string> = {
      device: `/devices/${alert.entity_id}`,
      integration: `/integrations/${alert.entity_id}`,
    };
    const route = routes[alert.entity_type];
    if (!route) return null;
    return (
      <button onClick={() => navigate(route)} className="text-xs text-blue-600 hover:underline">
        {alert.entity_type}/{alert.entity_id.slice(0, 8)}
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Alerts</h1>
        <div className="flex items-center gap-3">
          <Select value={severity} onChange={(e) => { setSeverity(e.target.value); setPage(1); }} className="text-sm">
            <option value="">All severities</option>
            {SEVERITY_OPTIONS.filter(Boolean).map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Select value={alertType} onChange={(e) => { setAlertType(e.target.value); setPage(1); }} className="text-sm">
            <option value="">All types</option>
            {TYPE_OPTIONS.filter(Boolean).map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
          </Select>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={showAcknowledged} onChange={(e) => setShowAcknowledged(e.target.checked)} className="rounded" />
            Show acknowledged
          </label>
        </div>
      </div>

      <Table<AlertRead>
        loading={isLoading}
        data={data?.items ?? []}
        rowKey={(r) => r.id}
        emptyMessage="No alerts. All clear!"
        columns={[
          { key: "severity", header: "Severity", render: (r) => (
            <div className="flex items-center gap-2">
              {getAlertIcon(r.alert_type)}
              <SeverityBadge severity={r.severity} />
            </div>
          )},
          { key: "alert_type", header: "Type", render: (r) => r.alert_type.replace(/_/g, " ") },
          { key: "message", header: "Message", render: (r) => (
            <span className="text-gray-800">{r.message}</span>
          )},
          { key: "entity", header: "Entity", render: (r) => entityLink(r) ?? "—" },
          { key: "created_at", header: "Created", render: (r) => formatDateTime(r.created_at) },
          { key: "acknowledged_at", header: "Ack'd", render: (r) => r.acknowledged_at ? (
            <div>
              <span className="text-xs text-gray-400">{formatDateTime(r.acknowledged_at)}</span>
              {r.acknowledged_by && <span className="text-xs text-gray-400 ml-1">by {r.acknowledged_by}</span>}
            </div>
          ) : (
            <button
              onClick={() => ackMut.mutate(r.id)}
              disabled={ackMut.isPending}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 hover:bg-green-100 hover:text-green-700 rounded text-gray-600 transition-colors"
            >
              <CheckCheck size={12} /> Acknowledge
            </button>
          )},
        ]}
      />
      <Pagination page={page} size={50} total={data?.total ?? 0} onChange={setPage} />
    </div>
  );
}
