import { useState } from "react";
import { useAuditLogs } from "@/api/auditLogs";
import { Table } from "@/components/common/Table";
import { StatusBadge } from "@/components/common/Badge";
import { Pagination } from "@/components/common/Pagination";
import { Input, Select } from "@/components/common/FormField";
import { formatDateTime } from "@/lib/utils";
import type { AuditLogRead } from "@/types";

const ENTITY_TYPES = ["","device","rack","room","datacenter","network_link","vlan","ip_address","ip_network","virt_cluster","virt_host","virtual_machine","integration","license","user"];
const ACTIONS = ["","create","update","delete","sync","login"];

export default function AuditLog() {
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [entityId, setEntityId] = useState("");

  const { data, isLoading } = useAuditLogs({
    entity_type: entityType || undefined,
    action: action || undefined,
    entity_id: entityId.trim() || undefined,
    page, size: 50,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }} className="text-sm">
          <option value="">All entities</option>
          {ENTITY_TYPES.filter(Boolean).map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
        </Select>
        <Select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className="text-sm">
          <option value="">All actions</option>
          {ACTIONS.filter(Boolean).map((a) => <option key={a} value={a}>{a}</option>)}
        </Select>
        <Input
          placeholder="Entity ID (UUID prefix)"
          value={entityId}
          onChange={(e) => { setEntityId(e.target.value); setPage(1); }}
          className="text-sm w-64"
        />
      </div>

      <Table<AuditLogRead>
        loading={isLoading}
        data={data?.items ?? []}
        rowKey={(r) => r.id}
        emptyMessage="No audit entries found."
        columns={[
          { key: "timestamp", header: "Time", render: (r) => formatDateTime(r.timestamp) },
          { key: "entity_type", header: "Entity Type", render: (r) => r.entity_type.replace(/_/g, " ") },
          { key: "entity_id", header: "Entity ID", render: (r) => (
            <span className="font-mono text-xs text-gray-600">{r.entity_id.slice(0, 12)}…</span>
          )},
          { key: "action", header: "Action", render: (r) => <StatusBadge status={r.action} /> },
          { key: "ip_address", header: "IP", render: (r) => r.ip_address ?? "—" },
          { key: "diff", header: "Changes", render: (r) => r.diff ? (
            <details className="cursor-pointer">
              <summary className="text-xs text-blue-600 hover:underline">View diff</summary>
              <pre className="mt-2 text-xs bg-gray-50 border border-gray-200 p-2 rounded max-w-sm overflow-auto whitespace-pre-wrap">
                {JSON.stringify(r.diff, null, 2)}
              </pre>
            </details>
          ) : <span className="text-gray-400">—</span> },
        ]}
      />
      <Pagination page={page} size={50} total={data?.total ?? 0} onChange={setPage} />
    </div>
  );
}
