import { useNavigate } from "react-router-dom";
import { AlertTriangle, HardDrive, Building2, Server, Activity } from "lucide-react";
import { useDashboardSummary, useDashboardAlerts } from "@/api/dashboard";
import { useAlertSummary } from "@/api/alerts";
import { SeverityBadge, StatusBadge } from "@/components/common/Badge";
import { Spinner } from "@/components/common/Spinner";
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
  const { data: alertSummary } = useAlertSummary();

  const recentAlerts: AlertRead[] = alertData?.items ?? alertData ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatCard icon={Building2} label="Data Centers" value={summary?.total_datacenters ?? 0} color="blue" onClick={() => navigate("/datacenters")} />
            <StatCard icon={Server} label="Racks" value={summary?.total_racks ?? 0} color="purple" onClick={() => navigate("/racks")} />
            <StatCard icon={HardDrive} label="Devices" value={summary?.total_devices ?? 0} color="green" onClick={() => navigate("/devices")} />
            <StatCard icon={Activity} label="VMs" value={summary?.total_vms ?? 0} color="orange" onClick={() => navigate("/virtual")} />
            <StatCard icon={AlertTriangle} label="Active Alerts" value={summary?.total_active_alerts ?? 0} color="red" onClick={() => navigate("/alerts")} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Device status breakdown */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h2 className="font-semibold text-gray-800 mb-4">Device Status</h2>
              {summary?.devices_by_status ? (
                <div className="space-y-3">
                  {Object.entries(summary.devices_by_status).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={status} />
                      </div>
                      <span className="font-semibold text-gray-900">{count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No data available.</p>
              )}
            </div>

            {/* Alert severity summary */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h2 className="font-semibold text-gray-800 mb-4">Alert Summary</h2>
              {alertSummary ? (
                <div className="space-y-3">
                  {Object.entries(alertSummary).map(([severity, count]) => (
                    <div key={severity} className="flex items-center justify-between">
                      <SeverityBadge severity={severity} />
                      <span className="font-semibold text-gray-900">{count}</span>
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
        </>
      )}
    </div>
  );
}
