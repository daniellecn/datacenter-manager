import { useState } from 'react';
import { X } from 'lucide-react';
import { useCreateDevice } from '@/api/devices';
import api from '@/api/index';
import { useQueryClient } from '@tanstack/react-query';
import { ModalOverlay, FormField, inputCls } from './AddRackModal';

interface Props {
  chassisId: string;
  chassisName: string;
  nextSlot: number;
  onClose: () => void;
}

export function AddBladeModal({ chassisId, chassisName, nextSlot, onClose }: Props) {
  const [name, setName] = useState('');
  const [slot, setSlot] = useState(nextSlot);
  const { mutateAsync, isPending, error } = useCreateDevice();
  const qc = useQueryClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      // Create the blade device, then set its server_detail with blade_chassis_id
      const device = await mutateAsync({
        name,
        device_type: 'blade',
        status: 'active',
      });
      // Upsert server detail with blade chassis reference
      await api.put(`/devices/${device.id}/server-detail`, {
        blade_chassis_id: chassisId,
        blade_slot: slot,
      });
      qc.invalidateQueries({ queryKey: ['devices', 'chassis-blades', chassisId] });
      qc.invalidateQueries({ queryKey: ['devices'] });
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
            Add Blade — {chassisName}
          </h2>
          <button type="button" onClick={onClose}>
            <X className="w-4 h-4 text-slate-400 hover:text-slate-600" />
          </button>
        </div>

        <FormField label="Blade Name *">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. blade-01"
            className={inputCls}
          />
        </FormField>

        <FormField label="Slot Number">
          <input
            type="number"
            min={1}
            max={32}
            value={slot}
            onChange={(e) => setSlot(Number(e.target.value))}
            className={inputCls}
          />
        </FormField>

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
            {isPending ? 'Creating…' : 'Add Blade'}
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}
