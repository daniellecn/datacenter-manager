import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/uiStore";
import {
  AlertTriangle,
  BarChart2,
  Building2,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Database,
  Globe,
  HardDrive,
  Key,
  LayoutGrid,
  List,
  Network,
  Server,
  Settings,
  Shield,
  TreePine,
  Users,
  Workflow,
} from "lucide-react";

const nav = [
  { to: "/dashboard", icon: BarChart2, label: "Dashboard" },
  { section: "Physical" },
  { to: "/datacenters", icon: Building2, label: "Data Centers" },
  { to: "/rooms", icon: LayoutGrid, label: "Rooms" },
  { to: "/corridors", icon: Columns2, label: "Corridors" },
  { to: "/racks", icon: Server, label: "Racks" },
  { to: "/devices", icon: HardDrive, label: "Devices" },
  { to: "/licenses", icon: Key, label: "Licenses" },
  { section: "Network" },
  { to: "/network-connections", icon: Network, label: "Connections" },
  { to: "/vlans", icon: Globe, label: "VLANs" },
  { to: "/ip-space", icon: List, label: "IP Space" },
  { to: "/san-fabrics", icon: Database, label: "SAN Fabrics" },
  { section: "Virtual" },
  { to: "/virtual", icon: Server, label: "Virtual" },
  { section: "Topology" },
  { to: "/topology", icon: Workflow, label: "Topology" },
  { to: "/tree", icon: TreePine, label: "Tree View" },
  { section: "Management" },
  { to: "/integrations", icon: Shield, label: "Integrations" },
  { to: "/alerts", icon: AlertTriangle, label: "Alerts" },
  { to: "/audit", icon: List, label: "Audit Log" },
  { to: "/users", icon: Users, label: "Users" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  return (
    <aside
      className={cn(
        "flex flex-col h-full bg-gray-900 text-white transition-all duration-200 shrink-0",
        sidebarCollapsed ? "w-16" : "w-56"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-700">
        {!sidebarCollapsed && (
          <span className="font-bold text-sm tracking-wide text-white truncate">
            DCManager
          </span>
        )}
        <button
          onClick={toggleSidebar}
          className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white ml-auto"
          title={sidebarCollapsed ? "Expand" : "Collapse"}
        >
          {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 space-y-0.5">
        {nav.map((item, i) => {
          if ("section" in item) {
            if (sidebarCollapsed) {
              return <div key={i} className="mx-3 my-2 border-t border-gray-700" />;
            }
            return (
              <p key={i} className="mt-4 mb-1 px-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
                {item.section}
              </p>
            );
          }
          const Icon = item.icon!;
          return (
            <NavLink
              key={item.to}
              to={item.to!}
              title={sidebarCollapsed ? item.label : undefined}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-4 py-2 text-sm transition-colors rounded-none",
                  "hover:bg-gray-700 hover:text-white",
                  isActive ? "bg-blue-700 text-white font-medium" : "text-gray-300"
                )
              }
            >
              <Icon size={16} className="shrink-0" />
              {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
