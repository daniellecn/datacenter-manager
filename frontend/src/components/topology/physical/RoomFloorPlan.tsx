/**
 * RoomFloorPlan — Level 1 of the hierarchical physical view.
 *
 * Renders the datacenter floor plan as a React Flow canvas.
 * - Room group nodes (non-draggable) act as visual containers.
 * - Rack tile nodes (draggable within their room) show power utilization color.
 * - Clicking a rack tile drills into the rack level.
 * - Each room has a "+" Add Rack button in the header.
 *
 * Layout is computed manually (no ELK) using a simple grid algorithm.
 */

import { memo, useCallback, useState, useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Plus, Loader2, AlertCircle } from 'lucide-react';
import { useFloorPlan } from '@/api/topology';
import type { FloorPlanRack, FloorPlanRoom } from '@/types/topology';
import { AddRackModal } from './AddRackModal';

// ─── Layout constants ─────────────────────────────────────────────────────────

const RACK_W = 130;
const RACK_H = 90;
const RACK_GAP = 12;
const RACKS_PER_ROW = 4;
const ROOM_PADDING = 16;
const ROOM_HEADER_H = 44;
const ROOM_GAP = 32;

function computeRoomSize(racks: FloorPlanRack[]) {
  const cols = Math.min(Math.max(racks.length, 1), RACKS_PER_ROW);
  const rows = Math.max(Math.ceil(racks.length / RACKS_PER_ROW), 1);
  return {
    w: ROOM_PADDING * 2 + cols * RACK_W + (cols - 1) * RACK_GAP,
    h: ROOM_HEADER_H + ROOM_PADDING + rows * RACK_H + (rows - 1) * RACK_GAP + ROOM_PADDING,
  };
}

// ─── Power utilization color helpers ─────────────────────────────────────────

function powerColor(pct: number | null | undefined): string {
  if (pct == null) return '#64748b'; // slate-500
  if (pct >= 90) return '#ef4444';   // red-500
  if (pct >= 75) return '#f97316';   // orange-500
  if (pct >= 50) return '#eab308';   // yellow-500
  return '#22c55e';                   // green-500
}

// ─── Node data types ──────────────────────────────────────────────────────────

interface RoomGroupData extends Record<string, unknown> {
  room: FloorPlanRoom;
  width: number;
  height: number;
  onAddRack: (room: FloorPlanRoom) => void;
}

interface RackTileData extends Record<string, unknown> {
  rack: FloorPlanRack;
  room: FloorPlanRoom;
  onRackClick: (room: FloorPlanRoom, rack: FloorPlanRack) => void;
}

// ─── Room group node ──────────────────────────────────────────────────────────

const RoomGroupNode = memo(function RoomGroupNode({ data }: NodeProps<Node<RoomGroupData>>) {
  const { room, width, height, onAddRack } = data;
  return (
    <div
      className="absolute rounded-xl border-2 border-dashed border-slate-500 dark:border-slate-600 bg-slate-200/60 dark:bg-slate-800/50"
      style={{ width, height }}
    >
      {/* Room header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-400 dark:border-slate-600">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
            {room.name}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">
            {room.racks.length} rack{room.racks.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onAddRack(room); }}
          className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-sky-600 hover:bg-sky-700 text-white rounded-md transition-colors shrink-0"
          title="Add Rack"
        >
          <Plus className="w-3 h-3" />
          Add Rack
        </button>
      </div>
    </div>
  );
});

// ─── Rack tile node ───────────────────────────────────────────────────────────

const RackTileNode = memo(function RackTileNode({ data, selected }: NodeProps<Node<RackTileData>>) {
  const { rack, room, onRackClick } = data;
  const pct = rack.power_utilization_pct;
  const uPct = rack.total_units > 0 ? Math.round((rack.used_units / rack.total_units) * 100) : 0;
  const accentColor = powerColor(pct);

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onRackClick(room, rack); }}
      className={[
        'flex flex-col justify-between rounded-lg border-2 cursor-pointer select-none p-2',
        'bg-white dark:bg-slate-800 shadow-md transition-all hover:scale-[1.03] hover:shadow-lg',
        selected ? 'border-sky-500 ring-2 ring-sky-300' : 'border-slate-300 dark:border-slate-600',
      ].join(' ')}
      style={{ width: RACK_W, height: RACK_H }}
      title={`${rack.name} · ${rack.used_units}/${rack.total_units}U used${pct != null ? ` · ${Math.round(pct)}% power` : ''}`}
    >
      {/* Top: colored power strip + name */}
      <div className="flex items-start gap-1.5">
        <div
          className="w-2 self-stretch rounded-sm shrink-0"
          style={{ backgroundColor: accentColor, minHeight: 24 }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate leading-tight">
            {rack.name}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">
            {rack.device_count} device{rack.device_count !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Bottom: U utilization bar */}
      <div className="space-y-0.5">
        <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
          <span>{rack.used_units}U / {rack.total_units}U</span>
          {pct != null && <span style={{ color: accentColor }}>{Math.round(pct)}%</span>}
        </div>
        <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${uPct}%`, backgroundColor: accentColor }}
          />
        </div>
      </div>
    </div>
  );
});

// ─── Node types ────────────────────────────────────────────────────────────────

const nodeTypes: NodeTypes = {
  roomGroup: RoomGroupNode as NodeTypes['roomGroup'],
  rackTile: RackTileNode as NodeTypes['rackTile'],
};

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  datacenterId?: string;
  onRackClick: (room: FloorPlanRoom, rack: FloorPlanRack) => void;
}

function RoomFloorPlanInner({ datacenterId, onRackClick }: Props) {
  const { data: floorPlan, isLoading, isError } = useFloorPlan(datacenterId);
  const [addRackRoom, setAddRackRoom] = useState<FloorPlanRoom | null>(null);

  const handleAddRack = useCallback((room: FloorPlanRoom) => {
    setAddRackRoom(room);
  }, []);

  const nodes = useMemo<Node[]>(() => {
    if (!floorPlan) return [];
    const result: Node[] = [];
    let xOffset = 0;

    for (const room of floorPlan.rooms) {
      const { w: roomW, h: roomH } = computeRoomSize(room.racks);

      // Room group node (parent)
      result.push({
        id: `room-${room.id}`,
        type: 'roomGroup',
        position: { x: xOffset, y: 0 },
        data: { room, width: roomW, height: roomH, onAddRack: handleAddRack } as RoomGroupData,
        draggable: false,
        selectable: false,
        style: { width: roomW, height: roomH, zIndex: 0 },
      });

      // Rack tile nodes (children)
      room.racks.forEach((rack, i) => {
        const col = i % RACKS_PER_ROW;
        const row = Math.floor(i / RACKS_PER_ROW);
        result.push({
          id: `rack-${rack.id}`,
          type: 'rackTile',
          parentId: `room-${room.id}`,
          extent: 'parent',
          position: {
            x: ROOM_PADDING + col * (RACK_W + RACK_GAP),
            y: ROOM_HEADER_H + ROOM_PADDING + row * (RACK_H + RACK_GAP),
          },
          data: { rack, room, onRackClick } as RackTileData,
          style: { width: RACK_W, height: RACK_H, zIndex: 10 },
        });
      });

      xOffset += roomW + ROOM_GAP;
    }

    return result;
  }, [floorPlan, handleAddRack, onRackClick]);

  if (!datacenterId) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        Select a datacenter to view the floor plan.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Loading floor plan…</span>
      </div>
    );
  }

  if (isError || !floorPlan) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-red-500">
        <AlertCircle className="w-5 h-5" />
        <span className="text-sm">Failed to load floor plan.</span>
      </div>
    );
  }

  if (floorPlan.rooms.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        No rooms in this datacenter.
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={[]}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.1 }}
        minZoom={0.2}
        maxZoom={2.5}
        panOnDrag
        zoomOnScroll
        elementsSelectable={false}
        nodesDraggable={true}
        nodesConnectable={false}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
      >
        <MiniMap
          nodeColor={(n) => {
            if (n.type === 'rackTile') {
              const pct = (n.data as RackTileData).rack.power_utilization_pct;
              return powerColor(pct);
            }
            return '#334155';
          }}
          className="!bottom-4 !right-4"
          zoomable
          pannable
        />
        <Controls className="!bottom-4 !left-4" showInteractive={false} />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#94a3b8" />

        {/* Legend overlay */}
        <div className="absolute top-3 right-3 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm rounded-lg p-2.5 shadow border border-slate-200 dark:border-slate-700">
          <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
            Power Utilization
          </p>
          {[
            { label: '< 50%', color: 'bg-green-500' },
            { label: '50–75%', color: 'bg-yellow-500' },
            { label: '75–90%', color: 'bg-orange-500' },
            { label: '≥ 90%', color: 'bg-red-500' },
            { label: 'N/A', color: 'bg-slate-500' },
          ].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5 text-[10px] text-slate-600 dark:text-slate-300">
              <span className={`w-2.5 h-2.5 rounded-sm ${color} shrink-0`} />
              {label}
            </div>
          ))}
        </div>
      </ReactFlow>

      {addRackRoom && (
        <AddRackModal
          roomId={addRackRoom.id}
          roomName={addRackRoom.name}
          onClose={() => setAddRackRoom(null)}
        />
      )}
    </div>
  );
}

export function RoomFloorPlan(props: Props) {
  return (
    <ReactFlowProvider>
      <RoomFloorPlanInner {...props} />
    </ReactFlowProvider>
  );
}
