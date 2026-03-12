import { useState } from 'react';
import { X } from 'lucide-react';
import { useCreateRack } from '@/api/racks';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  roomId: string;
  roomName: string;
  onClose: () => void;
}

export function AddRackModal({ roomId, roomName, onClose }: Props) {
  const [name, setName] = useState('');
  const [totalU, setTotalU] = useState(42);
  const [row, setRow] = useState('');
  const [col, setCol] = useState('');
  const { mutateAsync, isPending, error } = useCreateRack();
  const qc = useQueryClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await mutateAsync({
        room_id: roomId,
        name,
        total_u: totalU,
        row: row || null,
        column: col || null,
      });
      qc.invalidateQueries({ queryKey: ['topology'] });
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
            Add Rack — {roomName}
          </h2>
          <button type="button" onClick={onClose}>
            <X className="w-4 h-4 text-slate-400 hover:text-slate-600" />
          </button>
        </div>

        <FormField label="Rack Name *">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. A01"
            className={inputCls}
          />
        </FormField>

        <FormField label="Total U">
          <input
            type="number"
            min={1}
            max={100}
            value={totalU}
            onChange={(e) => setTotalU(Number(e.target.value))}
            className={inputCls}
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Row">
            <input
              value={row}
              onChange={(e) => setRow(e.target.value)}
              placeholder="A"
              className={inputCls}
            />
          </FormField>
          <FormField label="Column">
            <input
              value={col}
              onChange={(e) => setCol(e.target.value)}
              placeholder="01"
              className={inputCls}
            />
          </FormField>
        </div>

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
            {isPending ? 'Creating…' : 'Create Rack'}
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}

// ─── Shared primitives ────────────────────────────────────────────────────────

export function ModalOverlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {children}
    </div>
  );
}

export function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">{label}</label>
      {children}
    </div>
  );
}

export const inputCls =
  'w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-400';
