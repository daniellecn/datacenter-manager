/**
 * Topology page — tabbed view: Physical | Network | Floor Plan
 *
 * Route: /topology
 * Also accessible with a ?dc=<datacenter_id> query param to pre-select a datacenter.
 */

import { useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { PhysicalView } from "@/components/topology/physical/PhysicalView";
import { NetworkTopologyCanvas } from "@/components/topology/NetworkTopologyCanvas";
import { DatacenterFloorPlan } from "@/components/topology/DatacenterFloorPlan";
import { useDatacenters } from "@/api/topology";
import { useUIStore } from "@/store";

type Tab = "physical" | "network" | "floorplan";

const TABS: { id: Tab; label: string; desc: string }[] = [
  {
    id: "physical",
    label: "Physical",
    desc: "Device nodes grouped by rack, with network links",
  },
  {
    id: "network",
    label: "Network",
    desc: "L2/L3 topology with VLAN highlighting",
  },
  {
    id: "floorplan",
    label: "Floor Plan",
    desc: "Rooms and racks colored by power utilization",
  },
];

export default function Topology() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab | null) ?? "physical";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  const dcFromParam = searchParams.get("dc") ?? undefined;
  const [selectedDcId, setSelectedDcId] = useState<string>(dcFromParam ?? "");

  const { data: dcs } = useDatacenters();
  const { clearHighlightedPath, setHighlightedVlan } = useUIStore();

  const handleTabChange = useCallback(
    (tab: Tab) => {
      setActiveTab(tab);
      clearHighlightedPath();
      setHighlightedVlan(null);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", tab);
        return next;
      });
    },
    [clearHighlightedPath, setHighlightedVlan, setSearchParams]
  );

  const handleDcChange = useCallback(
    (id: string) => {
      setSelectedDcId(id);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set("dc", id);
        else next.delete("dc");
        return next;
      });
    },
    [setSearchParams]
  );

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-50 dark:bg-slate-950">
      {/* ── Header bar ── */}
      <header className="shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-3 flex items-center gap-4">
        <h1 className="text-base font-semibold text-slate-800 dark:text-slate-100">
          Topology
        </h1>

        {/* Datacenter selector (shared across tabs) */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">
            Datacenter
          </label>
          <select
            value={selectedDcId}
            onChange={(e) => handleDcChange(e.target.value)}
            className="border border-slate-200 dark:border-slate-700 rounded px-2.5 py-1 text-xs bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-400"
          >
            <option value="">All</option>
            {dcs?.map((dc) => (
              <option key={dc.id} value={dc.id}>
                {dc.name}
              </option>
            ))}
          </select>
        </div>

        {/* Tab switcher */}
        <nav className="ml-auto flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              title={tab.desc}
              className={[
                "px-4 py-1.5 text-xs font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-sky-600 text-white"
                  : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800",
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {/* ── Canvas area (fills remaining height) ── */}
      <main className="flex-1 min-h-0 relative">
        {activeTab === "physical" && (
          <PhysicalView
            datacenterId={selectedDcId || undefined}
            datacenterName={dcs?.find((d) => d.id === selectedDcId)?.name}
          />
        )}
        {activeTab === "network" && (
          <NetworkTopologyCanvas datacenterId={selectedDcId || undefined} />
        )}
        {activeTab === "floorplan" && (
          <DatacenterFloorPlan datacenterId={selectedDcId || undefined} />
        )}
      </main>
    </div>
  );
}
