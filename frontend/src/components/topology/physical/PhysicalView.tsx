/**
 * PhysicalView — Hierarchical zoom navigation for the physical datacenter view.
 *
 * Three zoom levels:
 *   1. Room  — floor plan (Grid view) OR side-by-side rack elevation (Rack view)
 *   2. Rack  — Custom U-slot elevation diagram with drag-to-reposition
 *   3. Chassis — Custom blade-slot diagram for blade chassis devices
 *
 * Navigation:
 *   - Click a rack tile (grid view) or rack header (rack view) → drill to Rack level
 *   - Click a blade_chassis device → drill to Chassis level
 *   - Breadcrumb links → drill back up
 *
 * View toggle (room level only):
 *   - Grid view — React Flow floor plan with rack cards coloured by power utilisation
 *   - Rack view — Side-by-side full rack elevation columns for every rack in the datacenter
 *
 * Side panel:
 *   - Clicking any device opens DeviceDetailPanel (fixed to right edge of viewport)
 *   - Panel fetches full device record for serial number, management IP, last seen
 *   - Panel has "Open full detail" → navigates to /devices/:id
 */

import { useState, useEffect } from 'react';
import { ChevronRight, LayoutGrid, Columns, Plus } from 'lucide-react';
import type { FloorPlanRack, FloorPlanRoom } from '@/types/topology';
import type { DevicePanelInfo } from './DeviceDetailPanel';
import { DeviceDetailPanel } from './DeviceDetailPanel';
import { RoomFloorPlan } from './RoomFloorPlan';
import { RoomRackView } from './RoomRackView';
import { RackDiagram } from './RackDiagram';
import { ChassisDiagram } from './ChassisDiagram';
import { AddRoomModal } from './AddRoomModal';
import { FloorPlanRackPanel } from '../FloorPlanRackPanel';

type ZoomLevel = 'room' | 'rack' | 'chassis';
type ViewMode = 'grid' | 'rack';

interface Props {
  datacenterId?: string;
  datacenterName?: string;
}

export function PhysicalView({ datacenterId, datacenterName }: Props) {
  const [level, setLevel] = useState<ZoomLevel>('room');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedRoom, setSelectedRoom] = useState<FloorPlanRoom | null>(null);
  const [selectedRack, setSelectedRack] = useState<FloorPlanRack | null>(null);
  const [selectedChassis, setSelectedChassis] = useState<DevicePanelInfo | null>(null);
  const [detailDevice, setDetailDevice] = useState<DevicePanelInfo | null>(null);
  /** Rack open in the FloorPlanRackPanel side panel (rack view mode only). */
  const [panelRack, setPanelRack] = useState<FloorPlanRack | null>(null);
  const [showAddRoom, setShowAddRoom] = useState(false);

  // Reset to room level whenever datacenter changes
  useEffect(() => {
    setLevel('room');
    setViewMode('grid');
    setSelectedRoom(null);
    setSelectedRack(null);
    setSelectedChassis(null);
    setDetailDevice(null);
    setPanelRack(null);
  }, [datacenterId]);

  // ─── Navigation ─────────────────────────────────────────────────────────────

  function drillToRack(room: FloorPlanRoom, rack: FloorPlanRack) {
    setSelectedRoom(room);
    setSelectedRack(rack);
    setLevel('rack');
    setDetailDevice(null);
  }

  function drillToChassis(chassis: DevicePanelInfo) {
    setSelectedChassis(chassis);
    setLevel('chassis');
    setDetailDevice(null);
    setPanelRack(null);
  }

  function drillUp() {
    setDetailDevice(null);
    setPanelRack(null);
    if (level === 'chassis') {
      setLevel('rack');
      setSelectedChassis(null);
    } else if (level === 'rack') {
      setLevel('room');
      setSelectedRack(null);
      setSelectedRoom(null);
    }
  }

  function drillToLevel(target: ZoomLevel) {
    setDetailDevice(null);
    setPanelRack(null);
    if (target === 'room') {
      setLevel('room');
      setSelectedRoom(null);
      setSelectedRack(null);
      setSelectedChassis(null);
    } else if (target === 'rack' && level === 'chassis') {
      setLevel('rack');
      setSelectedChassis(null);
    }
  }

  // ─── Breadcrumb ─────────────────────────────────────────────────────────────

  const crumbs: Array<{ label: string; targetLevel: ZoomLevel; clickable: boolean }> = [
    {
      label: datacenterName || 'Floor Plan',
      targetLevel: 'room',
      clickable: level !== 'room',
    },
    ...(selectedRoom
      ? [{ label: selectedRoom.name, targetLevel: 'room' as ZoomLevel, clickable: false }]
      : []),
    ...(selectedRack
      ? [{ label: selectedRack.name, targetLevel: 'rack' as ZoomLevel, clickable: level === 'chassis' }]
      : []),
    ...(selectedChassis
      ? [{ label: selectedChassis.name, targetLevel: 'chassis' as ZoomLevel, clickable: false }]
      : []),
  ];

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-0 relative overflow-hidden">
      {/* Breadcrumb + toolbar bar */}
      <nav className="shrink-0 flex items-center gap-1 px-4 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-xs">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />}
            {crumb.clickable ? (
              <button
                onClick={() => drillToLevel(crumb.targetLevel)}
                className="text-sky-600 hover:text-sky-700 hover:underline font-medium"
              >
                {crumb.label}
              </button>
            ) : (
              <span
                className={
                  i === crumbs.length - 1
                    ? 'font-semibold text-slate-800 dark:text-slate-100'
                    : 'text-slate-500 dark:text-slate-400'
                }
              >
                {crumb.label}
              </span>
            )}
          </span>
        ))}

        {/* Back hint at non-room levels */}
        {level !== 'room' && (
          <button
            onClick={drillUp}
            className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex items-center gap-1"
          >
            ← Back
          </button>
        )}

        {/* Create buttons — only visible at room level */}
        {level === 'room' && datacenterId && (
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowAddRoom(true)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition-colors"
            >
              <Plus className="w-3 h-3" />
              Room
            </button>
          </div>
        )}

        {/* Grid / Rack view toggle — only visible at room level */}
        {level === 'room' && (
          <div className={datacenterId ? 'flex items-center rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden' : 'ml-auto flex items-center rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden'}>
            <button
              type="button"
              onClick={() => { setViewMode('grid'); setPanelRack(null); }}
              title="Grid view — rack cards"
              className={[
                'flex items-center gap-1.5 px-2.5 py-1 text-xs transition-colors',
                viewMode === 'grid'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800',
              ].join(' ')}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Grid
            </button>
            <button
              type="button"
              onClick={() => { setViewMode('rack'); setPanelRack(null); }}
              title="Rack view — side-by-side elevations"
              className={[
                'flex items-center gap-1.5 px-2.5 py-1 text-xs transition-colors border-l border-slate-200 dark:border-slate-700',
                viewMode === 'rack'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800',
              ].join(' ')}
            >
              <Columns className="w-3.5 h-3.5" />
              Rack
            </button>
          </div>
        )}
      </nav>

      {/* Canvas area */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Main view */}
        <div className="flex-1 min-w-0 min-h-0 relative overflow-hidden">
          {/* Room level — Grid view */}
          {level === 'room' && viewMode === 'grid' && (
            <RoomFloorPlan
              datacenterId={datacenterId}
              onRackClick={drillToRack}
            />
          )}

          {/* Room level — Rack view */}
          {level === 'room' && viewMode === 'rack' && (
            <RoomRackView
              datacenterId={datacenterId}
              onDeviceClick={(d) => { setPanelRack(null); setDetailDevice(d); }}
              onChassisClick={drillToChassis}
              onRackHeaderClick={(_room, rack) => { setDetailDevice(null); setPanelRack(rack); }}
            />
          )}

          {/* Rack level */}
          {level === 'rack' && selectedRack && (
            <RackDiagram
              rackId={selectedRack.id}
              rackName={selectedRack.name}
              totalUnits={selectedRack.total_units}
              onDeviceClick={setDetailDevice}
              onChassisClick={drillToChassis}
            />
          )}

          {/* Chassis level */}
          {level === 'chassis' && selectedChassis && (
            <ChassisDiagram
              chassisId={selectedChassis.id}
              chassisName={selectedChassis.name}
              onBladeClick={setDetailDevice}
            />
          )}

          {/* Device detail side panel — fixed to right edge of viewport */}
          {detailDevice && (
            <DeviceDetailPanel
              device={detailDevice}
              onClose={() => setDetailDevice(null)}
            />
          )}
        </div>

        {/* FloorPlanRackPanel — rack view mode: click rack header to open */}
        {level === 'room' && viewMode === 'rack' && panelRack && (
          <div className="w-80 shrink-0 border-l border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
            <FloorPlanRackPanel
              rackId={panelRack.id}
              rackName={panelRack.name}
              totalUnits={panelRack.total_units}
              onClose={() => setPanelRack(null)}
            />
          </div>
        )}
      </div>

      {showAddRoom && datacenterId && (
        <AddRoomModal datacenterId={datacenterId} onClose={() => setShowAddRoom(false)} />
      )}
    </div>
  );
}
