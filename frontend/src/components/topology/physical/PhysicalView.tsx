/**
 * PhysicalView — Hierarchical zoom navigation for the physical datacenter view.
 *
 * Three zoom levels:
 *   1. Room  — React Flow floor plan showing all racks per room
 *   2. Rack  — Custom U-slot elevation diagram with drag-to-reposition
 *   3. Chassis — Custom blade-slot diagram for blade chassis devices
 *
 * Navigation:
 *   - Click a rack tile → drill to Rack level
 *   - Click a blade_chassis device → drill to Chassis level
 *   - Breadcrumb links → drill back up
 *   - Click the background area at rack/chassis level → drill up one level
 *
 * Side panel:
 *   - Clicking any device opens DeviceDetailPanel (overlays current view)
 *   - Panel has "Open full detail" → navigates to /devices/:id
 */

import { useState, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import type { FloorPlanRack, FloorPlanRoom } from '@/types/topology';
import type { DevicePanelInfo } from './DeviceDetailPanel';
import { DeviceDetailPanel } from './DeviceDetailPanel';
import { RoomFloorPlan } from './RoomFloorPlan';
import { RackDiagram } from './RackDiagram';
import { ChassisDiagram } from './ChassisDiagram';

type ZoomLevel = 'room' | 'rack' | 'chassis';

interface Props {
  datacenterId?: string;
  datacenterName?: string;
}

export function PhysicalView({ datacenterId, datacenterName }: Props) {
  const [level, setLevel] = useState<ZoomLevel>('room');
  const [selectedRoom, setSelectedRoom] = useState<FloorPlanRoom | null>(null);
  const [selectedRack, setSelectedRack] = useState<FloorPlanRack | null>(null);
  const [selectedChassis, setSelectedChassis] = useState<DevicePanelInfo | null>(null);
  const [detailDevice, setDetailDevice] = useState<DevicePanelInfo | null>(null);

  // Reset to room level whenever datacenter changes
  useEffect(() => {
    setLevel('room');
    setSelectedRoom(null);
    setSelectedRack(null);
    setSelectedChassis(null);
    setDetailDevice(null);
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
  }

  function drillUp() {
    setDetailDevice(null);
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
      {/* Breadcrumb bar */}
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
            className="ml-auto text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex items-center gap-1"
          >
            ← Back
          </button>
        )}
      </nav>

      {/* Canvas area */}
      <div className="flex-1 min-h-0 relative">
        {level === 'room' && (
          <RoomFloorPlan
            datacenterId={datacenterId}
            onRackClick={drillToRack}
          />
        )}

        {level === 'rack' && selectedRack && (
          <RackDiagram
            rackId={selectedRack.id}
            rackName={selectedRack.name}
            totalUnits={selectedRack.total_units}
            onDeviceClick={setDetailDevice}
            onChassisClick={drillToChassis}
          />
        )}

        {level === 'chassis' && selectedChassis && (
          <ChassisDiagram
            chassisId={selectedChassis.id}
            chassisName={selectedChassis.name}
            onBladeClick={setDetailDevice}
          />
        )}

        {/* Device detail side panel (overlays current view) */}
        {detailDevice && (
          <DeviceDetailPanel
            device={detailDevice}
            onClose={() => setDetailDevice(null)}
          />
        )}
      </div>
    </div>
  );
}
