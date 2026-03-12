import { useNavigate } from "react-router-dom";
import { Bell, LogOut, Search, User } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useLogout } from "@/api/auth";
import { useAlertSummary } from "@/api/alerts";
import { cn } from "@/lib/utils";
import { useState } from "react";

export function Topbar() {
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();
  const { data: alertSummary } = useAlertSummary();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const criticalCount = alertSummary?.critical ?? 0;

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (search.trim()) navigate(`/search?q=${encodeURIComponent(search.trim())}`);
  }

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-4 shrink-0">
      {/* Global search */}
      <form onSubmit={handleSearch} className="flex-1 max-w-md">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search devices, IPs, VMs…"
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </form>

      <div className="flex items-center gap-2 ml-auto">
        {/* Alerts bell */}
        <button
          onClick={() => navigate("/alerts")}
          className={cn(
            "relative p-2 rounded-lg hover:bg-gray-100 text-gray-500",
            criticalCount > 0 && "text-red-500"
          )}
          title="Alerts"
        >
          <Bell size={18} />
          {criticalCount > 0 && (
            <span className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold">
              {criticalCount > 9 ? "9+" : criticalCount}
            </span>
          )}
        </button>

        {/* User */}
        <div className="flex items-center gap-2 pl-2 border-l border-gray-200">
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <div className="h-7 w-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold">
              {user?.username?.[0]?.toUpperCase() ?? <User size={14} />}
            </div>
            <span className="hidden sm:block font-medium max-w-[120px] truncate">{user?.username}</span>
            <span className="hidden sm:block text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
              {user?.role}
            </span>
          </div>
          <button
            onClick={() => logout.mutate()}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"
            title="Log out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
