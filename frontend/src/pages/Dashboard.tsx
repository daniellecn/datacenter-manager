import { useNavigate } from "react-router-dom";
import { AlertTriangle, HardDrive, Building2, Server, Activity } from "lucide-react";
import { useDashboardSummary, useDashboardAlerts } from "@/api/dashboard";
import { SeverityBadge } from "@/components/common/Badge";
import { PageSpinner } from "@/components/common/Spinner";
import { formatDateTime } from "@/lib/utils";
import type { AlertRead } from "@/types";

function StatCard({
  icon: Icon,
  label,
  value,
  color = "blue",
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  color?: string;
  onClick?: () => void;
}) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600",
    orange: "bg-orange-50 text-orange-600",
    red: "bg-red-50 text-red-600",
  };
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4 shadow-sm ${onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`}
    >
      <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${colorMap[color] ?? colorMap.blue}`}>
        <Icon size={22} />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: summary, isLoading } = useDashboardSummary();
  const { data: alertData } = useDashboardAlerts();

  const recentAlerts: AlertRead[] = Array.isArray(alertData) ? alertData : (alertData?.items ?? []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {isLoading ? (
        <PageSpinner />
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatCard icon={Building2} label="Data Centers" value={summary?.datacenters ?? 0} color="blue" onClick={() => navigate("/datacenters")} />
            <StatCard icon={Server} label="Racks" value={summary?.racks ?? 0} color="purple" onClick={() => navigate("/racks")} />
            <StatCard icon={HardDrive} label="Devices" value={summary?.devices_total ?? 0} color="green" onClick={() => navigate("/devices")} />
            <StatCard icon={Activity} label="VMs" value={summary?.vms_total ?? 0} color="orange" onClick={() => navigate("/virtual")} />
            <StatCard icon={AlertTriangle} label="Active Alerts" value={summary?.alerts.total ?? 0} color="red" onClick={() => navigate("/alerts")} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Device type breakdown */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h2 className="font-semibold text-gray-800 mb-4">Devices by Type</h2>
              {summary?.devices_by_type ? (
                <div className="space-y-2">
                  {Object.entries(summary.devices_by_type)
                    .filter(([, count]) => count > 0)
                    .sort(([, a], [, b]) => b - a)
                    .map(([type, count]) => (
                      <div key={type} className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 capitalize">{type.replace(/_/g, " ")}</span>
                        <span className="font-semibold text-gray-900">{count}</span>
                      </div>
                    ))}
                  {Object.values(summary.devices_by_type).every((v) => v === 0) && (
                    <p className="text-sm text-gray-400">No devices yet.</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No data available.</p>
              )}
            </div>

            {/* Alert severity summary */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h2 className="font-semibold text-gray-800 mb-4">Alert Summary</h2>
              {summary?.alerts ? (
                <div className="space-y-3">
                  {(["critical", "warning", "info"] as const).map((severity) => (
                    <div key={severity} className="flex items-center justify-between">
                      <SeverityBadge severity={severity} />
                      <span className="font-semibold text-gray-900">{summary.alerts[severity]}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No alerts.</p>
              )}
            </div>
          </div>

          {/* Recent alerts */}
          {recentAlerts.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800">Recent Alerts</h2>
                <button onClick={() => navigate("/alerts")} className="text-sm text-blue-600 hover:underline">
                  View all
                </button>
              </div>
              <div className="divide-y divide-gray-50">
                {recentAlerts.slice(0, 5).map((alert) => (
                  <div key={alert.id} className="px-5 py-3 flex items-start gap-3">
                    <SeverityBadge severity={alert.severity} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800">{alert.message}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(alert.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Infrastructure summary row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm text-center">
              <p className="text-xl font-bold text-gray-900">{summary?.devices_active ?? 0}</p>
              <p className="text-sm text-gray-500">Active Devices</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm text-center">
              <p className="text-xl font-bold text-gray-900">{summary?.vms_running ?? 0}</p>
              <p className="text-sm text-gray-500">Running VMs</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm text-center">
              <p className="text-xl font-bold text-gray-900">{summary?.virt_hosts ?? 0}</p>
              <p className="text-sm text-gray-500">Hypervisor Hosts</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm text-center">
              <p className="text-xl font-bold text-gray-900">{summary?.rooms ?? 0}</p>
              <p className="text-sm text-gray-500">Rooms</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
