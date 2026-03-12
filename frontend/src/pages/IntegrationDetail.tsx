import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, RefreshCw, CheckCircle, XCircle, Clock } from "lucide-react";
import { useIntegration, useIntegrationSyncLogs, useTriggerSync } from "@/api/integrations";
import { StatusBadge } from "@/components/common/Badge";
import { Table } from "@/components/common/Table";
import { Spinner } from "@/components/common/Spinner";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { formatDateTime } from "@/lib/utils";
import type { SyncLogRead } from "@/types";

function SyncStatusIcon({ status }: { status: string | null }) {
  if (status === "success") return <CheckCircle size={16} className="text-green-500" />;
  if (status === "failed") return <XCircle size={16} className="text-red-500" />;
  if (status === "partial") return <Clock size={16} className="text-yellow-500" />;
  return <Clock size={16} className="text-gray-400" />;
}

function durationSec(started: string, completed: string | null): string {
  if (!completed) return "Running…";
  const s = (new Date(completed).getTime() - new Date(started).getTime()) / 1000;
  return `${s.toFixed(1)}s`;
}

export default function IntegrationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: integration, isLoading } = useIntegration(id!);
  const { data: syncLogs, isLoading: logsLoading } = useIntegrationSyncLogs(id!);
  const triggerMut = useTriggerSync(id!);

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
  if (!integration) return <div className="text-gray-500">Integration not found.</div>;

  return (
    <div className="space-y-5">
      <Breadcrumbs crumbs={[{ label: "Integrations", to: "/integrations" }, { label: integration.name }]} />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{integration.name}</h1>
            <p className="text-sm text-gray-500">
              {integration.integration_type.replace(/_/g, " ")} · {integration.host}
              {integration.port ? `:${integration.port}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={integration.status} />
          <button
            onClick={() => triggerMut.mutate()}
            disabled={triggerMut.isPending}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60"
          >
            <RefreshCw size={15} className={triggerMut.isPending ? "animate-spin" : ""} />
            {triggerMut.isPending ? "Syncing…" : "Sync Now"}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Last Polled", value: formatDateTime(integration.last_polled_at) },
          { label: "Last Success", value: formatDateTime(integration.last_success_at) },
          { label: "Poll Interval", value: `${integration.polling_interval_sec}s` },
          { label: "Enabled", value: integration.enabled ? "Yes" : "No" },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className="font-semibold text-gray-900 text-sm">{value}</p>
          </div>
        ))}
      </div>

      {/* Error message */}
      {integration.error_message && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <p className="font-semibold mb-1">Last Error</p>
          <p className="font-mono text-xs whitespace-pre-wrap">{integration.error_message}</p>
        </div>
      )}

      {/* Sync history */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Sync History</h2>
        </div>
        <Table<SyncLogRead>
          loading={logsLoading}
          data={(syncLogs ?? []).slice(0, 20)}
          rowKey={(r) => r.id}
          emptyMessage="No sync runs yet."
          columns={[
            { key: "status", header: "Result", render: (r) => (
              <div className="flex items-center gap-2">
                <SyncStatusIcon status={r.status} />
                <span className="text-sm capitalize">{r.status ?? "in progress"}</span>
              </div>
            )},
            { key: "started_at", header: "Started", render: (r) => formatDateTime(r.started_at) },
            { key: "duration", header: "Duration", render: (r) => durationSec(r.started_at, r.completed_at) },
            { key: "items_created", header: "Created" },
            { key: "items_updated", header: "Updated" },
            { key: "items_unchanged", header: "Unchanged" },
            { key: "errors", header: "Errors", render: (r) => {
              const count = r.errors?.length ?? 0;
              if (count === 0) return <span className="text-gray-400">None</span>;
              return (
                <details>
                  <summary className="cursor-pointer text-red-600 text-xs">{count} error{count > 1 ? "s" : ""}</summary>
                  <pre className="mt-1 text-xs bg-red-50 p-2 rounded max-w-xs overflow-auto">
                    {JSON.stringify(r.errors, null, 2)}
                  </pre>
                </details>
              );
            }},
          ]}
        />
      </div>
    </div>
  );
}
