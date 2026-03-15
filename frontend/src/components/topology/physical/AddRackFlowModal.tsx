/**
 * AddRackFlowModal — toolbar-level "Add Rack" that cascades room → corridor → rack fields.
 * Used when there is no pre-selected corridor (contrast with AddRackModal which requires corridorId).
 */

import { useState } from 'react';
import { X } from 'lucide-react';
import { useCreateRack } from '@/api/racks';
import { useRooms } from '@/api/rooms';
import { useCorridors } from '@/api/corridors';
import { useQueryClient } from '@tanstack/react-query';
import { ModalOverlay, FormField, inputCls } from './AddRackModal';

interface Props {
  datacenterId: string;
  onClose: () => void;
}

export function AddRackFlowModal({ datacenterId, onClose }: Props) {
  const { data: roomsPage } = useRooms({ datacenter_id: datacenterId });
  const rooms = roomsPage?.items ?? [];

  const [roomId, setRoomId] = useState('');
  const { data: corridorsPage } = useCorridors({ room_id: roomId });
  const corridors = corridorsPage?.items ?? [];

  const [corridorId, setCorridorId] = useState('');
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
        corridor_id: corridorId,
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
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Add Rack</h2>
          <button type="button" onClick={onClose}>
            <X className="w-4 h-4 text-slate-400 hover:text-slate-600" />
          </button>
        </div>

        <FormField label="Room *">
          <select
            required
            value={roomId}
            onChange={(e) => { setRoomId(e.target.value); setCorridorId(''); }}
            className={inputCls}
          >
            <option value="">Select a room…</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </FormField>

        <FormField label="Corridor *">
          <select
            required
            value={corridorId}
            onChange={(e) => setCorridorId(e.target.value)}
            disabled={!roomId}
            className={inputCls}
          >
            <option value="">{roomId ? 'Select a corridor…' : 'Select a room first'}</option>
            {corridors.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </FormField>

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
