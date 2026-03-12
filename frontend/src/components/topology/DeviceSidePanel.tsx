import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUIStore } from "@/store";
import type { TopologyNodeData, DeviceType } from "@/types/topology";
import { DeviceIcon, DEVICE_COLORS, STATUS_DOT } from "./icons";
import type { Node } from "@xyflow/react";

interface DeviceSidePanelProps {
  nodes: Node[];
}

export function DeviceSidePanel({ nodes }: DeviceSidePanelProps) {
  const { topology, closeSidePanel } = useUIStore();
  const navigate = useNavigate();
  const open = topology.sidePanelOpen && !!topology.selectedNodeId;

  const selectedNode = nodes.find((n) => n.id === topology.selectedNodeId);
  const data = selectedNode?.data as TopologyNodeData | undefined;

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSidePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeSidePanel]);

  return (
    <>
      {/* Backdrop (click to close) */}
      {open && (
        <div
          className="absolute inset-0 z-10"
          onClick={closeSidePanel}
          aria-hidden="true"
        />
      )}

      {/* Slide-in panel */}
      <div
        className={[
          "absolute top-0 right-0 h-full z-20 flex flex-col",
          "w-72 bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-700",
          "transition-transform duration-250 ease-in-out",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
        role="complementary"
        aria-label="Device details"
      >
        {data ? (
          <>
            {/* Header */}
            <div
              className={`flex items-center gap-3 px-4 py-3 ${DEVICE_COLORS[data.device_type as DeviceType]?.bg ?? "bg-gray-500"} text-white`}
            >
              <DeviceIcon deviceType={data.device_type as DeviceType} size={22} className="text-white shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold truncate">{data.label}</span>
                <span className="text-xs opacity-80 capitalize">{data.device_type?.replace("_", " ")}</span>
              </div>
              <button
                onClick={closeSidePanel}
                className="ml-auto p-1 rounded hover:bg-white/20 transition-colors"
                aria-label="Close panel"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
              {/* Status */}
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[data.status] ?? "bg-gray-300"}`} />
                <span className="capitalize text-slate-700 dark:text-slate-200">{data.status}</span>
              </div>

              {/* Location */}
              <Section title="Location">
                {data.datacenter_name && <Row label="Datacenter" value={data.datacenter_name} />}
                {data.room_name && <Row label="Room" value={data.room_name} />}
                {data.rack_name && <Row label="Rack" value={data.rack_name} />}
              </Section>

              {/* Network */}
              {(data.ip_addresses?.length ?? 0) > 0 && (
                <Section title="IP Addresses">
                  {data.ip_addresses!.map((ip) => (
                    <span
                      key={ip}
                      className="block font-mono text-xs text-slate-600 dark:text-slate-300"
                    >
                      {ip}
                    </span>
                  ))}
                </Section>
              )}

              {/* VLANs */}
              {(data.vlans?.length ?? 0) > 0 && (
                <Section title="VLANs">
                  <div className="flex flex-wrap gap-1">
                    {data.vlans!.map((v) => (
                      <span
                        key={v}
                        className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                      >
                        VLAN {v}
                      </span>
                    ))}
                  </div>
                </Section>
              )}

              {/* Power */}
              {data.power_rated_w !== null && data.power_rated_w !== undefined && (
                <Section title="Power">
                  <Row label="Rated" value={`${data.power_rated_w} W`} />
                </Section>
              )}
            </div>

            {/* Footer actions */}
            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex gap-2">
              <button
                onClick={() => {
                  closeSidePanel();
                  navigate(`/devices/${topology.selectedNodeId}`);
                }}
                className="flex-1 py-1.5 rounded text-xs font-medium bg-sky-600 hover:bg-sky-700 text-white transition-colors"
              >
                View Full Detail
              </button>
              <button
                onClick={closeSidePanel}
                className="px-3 py-1.5 rounded text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
              >
                Close
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col h-full items-center justify-center text-slate-400 text-sm gap-2 p-6">
            <span>No device selected</span>
            <button onClick={closeSidePanel} className="text-xs text-slate-500 underline">
              Close
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
        {title}
      </h3>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs gap-2">
      <span className="text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
      <span className="text-slate-700 dark:text-slate-200 text-right truncate">{value}</span>
    </div>
  );
}
