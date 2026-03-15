import { useState } from 'react';
import { X } from 'lucide-react';
import { useCreateRoom } from '@/api/rooms';
import { useQueryClient } from '@tanstack/react-query';
import { ModalOverlay, FormField, inputCls } from './AddRackModal';

interface Props {
  datacenterId: string;
  onClose: () => void;
}

export function AddRoomModal({ datacenterId, onClose }: Props) {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const { mutateAsync, isPending, error } = useCreateRoom();
  const qc = useQueryClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await mutateAsync({ datacenter_id: datacenterId, name, notes: notes || null });
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
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Add Room</h2>
          <button type="button" onClick={onClose}>
            <X className="w-4 h-4 text-slate-400 hover:text-slate-600" />
          </button>
        </div>

        <FormField label="Room Name *">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Server Room A"
            className={inputCls}
          />
        </FormField>

        <FormField label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes"
            rows={3}
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
            {isPending ? 'Creating…' : 'Create Room'}
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}
