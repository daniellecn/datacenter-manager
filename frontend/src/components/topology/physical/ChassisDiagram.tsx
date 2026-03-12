/**
 * ChassisDiagram — Level 3 of the hierarchical physical view.
 *
 * Shows blade cards installed in a blade chassis.
 * Fetches blades via GET /devices?blade_chassis_id={chassisId}.
 * Cards are rendered in a grid; clicking a blade opens the DeviceDetailPanel.
 */

import { useState } from 'react';
import { Plus, AlertCircle, Loader2 } from 'lucide-react';
import { useChassisBlades } from '@/api/topology';
import type { DeviceRead } from '@/types';
import { DeviceIcon, DEVICE_COLORS } from '@/components/topology/icons';
import type { DevicePanelInfo } from './DeviceDetailPanel';
import { AddBladeModal } from './AddBladeModal';

interface Props {
  chassisId: string;
  chassisName: string;
  onBladeClick: (device: DevicePanelInfo) => void;
}

function bladeToPanel(b: DeviceRead): DevicePanelInfo {
  return {
    id: b.id,
    name: b.name,
    device_type: b.device_type,
    status: b.status,
    power_rated_w: b.power_rated_w,
    power_actual_w: b.power_actual_w,
    model: b.model,
    vendor: b.manufacturer,
  };
}

export function ChassisDiagram({ chassisId, chassisName, onBladeClick }: Props) {
  const { data: blades, isLoading, isError } = useChassisBlades(chassisId);
  const [showAddBlade, setShowAddBlade] = useState(false);

  const nextSlot = blades ? blades.length + 1 : 1;

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-100 dark:bg-slate-950">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center justify-between px-5 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide font-medium">
            Blade Chassis
          </p>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{chassisName}</p>
        </div>
        <button
          onClick={() => setShowAddBlade(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Blade
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto p-6">
        {isLoading && (
          <div className="flex items-center justify-center h-48 gap-2 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading blades…</span>
          </div>
        )}

        {isError && (
          <div className="flex items-center justify-center h-48 gap-2 text-amber-600">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">
              Could not load blades. The backend may not support chassis filtering yet.
            </span>
          </div>
        )}

        {!isLoading && !isError && blades?.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-400">
            <p className="text-sm">No blades installed in this chassis.</p>
            <button
              onClick={() => setShowAddBlade(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-sky-500 text-sky-600 rounded-lg hover:bg-sky-50 dark:hover:bg-sky-950 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add first blade
            </button>
          </div>
        )}

        {!isLoading && !isError && blades && blades.length > 0 && (
          <div className="max-w-2xl mx-auto">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              {blades.length} blade{blades.length !== 1 ? 's' : ''} installed
            </p>

            {/* Chassis frame */}
            <div className="bg-slate-800 dark:bg-slate-950 rounded-xl p-4 space-y-1.5 shadow-inner">
              {/* Slot header */}
              <div className="flex items-center gap-2 px-2 mb-2">
                <span className="text-xs text-slate-500 font-mono w-10 shrink-0">Slot</span>
                <span className="text-xs text-slate-500 font-medium">Blade</span>
                <span className="ml-auto text-xs text-slate-500">Status</span>
              </div>

              {blades.map((blade, i) => (
                <BladeCard
                  key={blade.id}
                  blade={blade}
                  slot={i + 1}
                  onClick={() => onBladeClick(bladeToPanel(blade))}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {showAddBlade && (
        <AddBladeModal
          chassisId={chassisId}
          chassisName={chassisName}
          nextSlot={nextSlot}
          onClose={() => setShowAddBlade(false)}
        />
      )}
    </div>
  );
}

// ─── Blade card ────────────────────────────────────────────────────────────────

function BladeCard({
  blade,
  slot,
  onClick,
}: {
  blade: DeviceRead;
  slot: number;
  onClick: () => void;
}) {
  const dt = blade.device_type === 'blade' ? 'blade' as const : 'server' as const;
  const colors = DEVICE_COLORS[dt] ?? DEVICE_COLORS.generic;

  const statusColor =
    blade.status === 'active'
      ? 'bg-emerald-400'
      : blade.status === 'maintenance'
      ? 'bg-amber-400'
      : 'bg-gray-400';

  return (
    <button
      onClick={onClick}
      className={[
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg',
        'bg-slate-700 dark:bg-slate-800 hover:bg-slate-600 dark:hover:bg-slate-700',
        'border border-slate-600 dark:border-slate-700',
        'text-left transition-colors group',
      ].join(' ')}
    >
      {/* Slot number */}
      <span className="w-10 shrink-0 text-xs font-mono text-slate-400 text-center">
        {String(slot).padStart(2, '0')}
      </span>

      {/* Icon */}
      <span className={`shrink-0 ${colors.text}`}>
        <DeviceIcon deviceType={dt} size={16} />
      </span>

      {/* Name + model */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-100 truncate group-hover:text-white">
          {blade.name}
        </p>
        {(blade.manufacturer || blade.model) && (
          <p className="text-xs text-slate-400 truncate">
            {[blade.manufacturer, blade.model].filter(Boolean).join(' ')}
          </p>
        )}
      </div>

      {/* Status dot */}
      <span className={`shrink-0 w-2.5 h-2.5 rounded-full ${statusColor}`} title={blade.status} />
    </button>
  );
}
