import { useState } from 'react';
import { X } from 'lucide-react';
import { useCreateDevice } from '@/api/devices';
import { useQueryClient } from '@tanstack/react-query';
import type { RackElevationDevice } from '@/types/topology';
import { ModalOverlay, FormField, inputCls } from './AddRackModal';

const DEVICE_TYPES = [
  'server', 'switch', 'router', 'firewall', 'storage',
  'pdu', 'patch_panel', 'blade_chassis', 'generic',
];

interface Props {
  rackId: string;
  rackName: string;
  totalUnits: number;
  existingDevices: RackElevationDevice[];
  onClose: () => void;
}

/** Returns the first free U slot that fits `height` units, starting from U1. */
function nextFreeSlot(devices: RackElevationDevice[], totalUnits: number, height = 1): number {
  const occupied = new Set<number>();
  for (const d of devices) {
    if (d.rack_unit_start != null) {
      for (let u = d.rack_unit_start; u < d.rack_unit_start + d.rack_unit_height; u++) {
        occupied.add(u);
      }
    }
  }
  for (let u = 1; u <= totalUnits - height + 1; u++) {
    let fits = true;
    for (let h = 0; h < height; h++) {
      if (occupied.has(u + h)) { fits = false; break; }
    }
    if (fits) return u;
  }
  return 1;
}

export function AddDeviceModal({ rackId, rackName, totalUnits, existingDevices, onClose }: Props) {
  const [name, setName] = useState('');
  const [deviceType, setDeviceType] = useState('server');
  const [height, setHeight] = useState(1);
  const [unitStart, setUnitStart] = useState(() => nextFreeSlot(existingDevices, totalUnits, 1));
  const { mutateAsync, isPending, error } = useCreateDevice();
  const qc = useQueryClient();

  function handleHeightChange(h: number) {
    setHeight(h);
    setUnitStart(nextFreeSlot(existingDevices, totalUnits, h));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await mutateAsync({
        rack_id: rackId,
        name,
        device_type: deviceType,
        rack_unit_start: unitStart,
        rack_unit_size: height,
        status: 'active',
      });
      qc.invalidateQueries({ queryKey: ['topology', 'rack-elevation', rackId] });
      qc.invalidateQueries({ queryKey: ['topology', 'floor-plan'] });
      onClose();
    } catch {
      // error shown via `error` state
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
            Add Device — {rackName}
          </h2>
          <button type="button" onClick={onClose}>
            <X className="w-4 h-4 text-slate-400 hover:text-slate-600" />
          </button>
        </div>

        <FormField label="Device Name *">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. web-server-01"
            className={inputCls}
          />
        </FormField>

        <FormField label="Device Type">
          <select
            value={deviceType}
            onChange={(e) => setDeviceType(e.target.value)}
            className={inputCls}
          >
            {DEVICE_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Rack Unit Start">
            <input
              type="number"
              min={1}
              max={totalUnits}
              value={unitStart}
              onChange={(e) => setUnitStart(Number(e.target.value))}
              className={inputCls}
            />
          </FormField>
          <FormField label="Height (U)">
            <input
              type="number"
              min={1}
              max={totalUnits}
              value={height}
              onChange={(e) => handleHeightChange(Number(e.target.value))}
              className={inputCls}
            />
          </FormField>
        </div>

        <p className="text-xs text-slate-400">
          Rack: {rackName} · {totalUnits}U total ·{' '}
          {totalUnits - existingDevices.reduce((s, d) => s + d.rack_unit_height, 0)} U free
        </p>

        {error && (
          <p className="text-xs text-red-600">{String((error as Error).message)}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 text-sm rounded-lg bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50 transition-colors"
          >
            {isPending ? 'Creating…' : 'Add Device'}
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}
