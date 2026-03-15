import { useState } from 'react';
import { X } from 'lucide-react';
import { useCreateCorridor } from '@/api/corridors';
import { useQueryClient } from '@tanstack/react-query';
import { ModalOverlay, FormField, inputCls } from './AddRackModal';

interface Props {
  roomId: string;
  roomName: string;
  onClose: () => void;
}

export function AddCorridorModal({ roomId, roomName, onClose }: Props) {
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const { mutateAsync, isPending, error } = useCreateCorridor();
  const qc = useQueryClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await mutateAsync({
        room_id: roomId,
        name,
        position: position ? parseInt(position) : null,
      });
      qc.invalidateQueries({ queryKey: ['topology'] });
      onClose();
    } catch {
      // error shown via `error` state
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
            Add Corridor — {roomName}
          </h2>
          <button type="button" onClick={onClose}>
            <X className="w-4 h-4 text-slate-400 hover:text-slate-600" />
          </button>
        </div>

        <FormField label="Corridor Name *">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Cold Aisle 1"
            className={inputCls}
          />
        </FormField>

        <FormField label="Position (order within room)">
          <input
            type="number"
            min={1}
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder="e.g. 1"
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
            className="px-4 py-2 text-sm rounded-lg bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50 transition-colors"
          >
            {isPending ? 'Creating…' : 'Create Corridor'}
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}
