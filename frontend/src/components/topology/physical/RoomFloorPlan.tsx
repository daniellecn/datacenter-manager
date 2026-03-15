/**
 * RoomFloorPlan — Level 1 of the hierarchical physical view.
 *
 * Renders the datacenter floor plan as a React Flow canvas.
 * - Room group nodes act as visual containers.
 * - Corridor headers are rendered as HTML divs inside the room node.
 * - Rack tile nodes show power utilization color.
 * - Clicking a rack tile drills into the rack level.
 * - Each corridor has a "+ Add Rack" button in its header.
 */

import {
  memo,
  useCallback,
  useState,
  useMemo,
  createContext,
  useContext,
} from 'react';
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
import type { FloorPlanCorridor, FloorPlanRack, FloorPlanRoom } from '@/types/topology';
import { AddRackModal } from './AddRackModal';
import { AddCorridorModal } from './AddCorridorModal';

// ─── Layout constants ─────────────────────────────────────────────────────────

const RACK_W = 130;
const RACK_H = 90;
const RACK_GAP = 12;
const RACKS_PER_ROW = 4;
const ROOM_PADDING = 16;
const ROOM_HEADER_H = 44;
const ROOM_GAP = 32;
const CORRIDOR_HEADER_H = 30;
const CORRIDOR_GAP = 10;

interface CorridorLayout {
  corridor: FloorPlanCorridor;
  headerY: number;     // top of corridor header within room node
  racksStartY: number; // top of first rack row
}

function computeRoomLayout(corridors: FloorPlanCorridor[]): {
  width: number;
  height: number;
  corridorLayouts: CorridorLayout[];
} {
  let y = ROOM_HEADER_H + ROOM_PADDING;
  const corridorLayouts: CorridorLayout[] = [];

  for (const corridor of corridors) {
    const count = corridor.racks.length;
    const cols = Math.min(Math.max(count, 1), RACKS_PER_ROW);
    const rows = Math.max(Math.ceil(count / RACKS_PER_ROW), 1);
    corridorLayouts.push({
      corridor,
      headerY: y,
      racksStartY: y + CORRIDOR_HEADER_H,
    });
    y += CORRIDOR_HEADER_H + rows * RACK_H + (rows - 1) * RACK_GAP + CORRIDOR_GAP;
    void cols; // used only for type-checking
  }

  // Room width: widest corridor's rack row
  const maxCols = corridors.reduce(
    (acc, c) => Math.max(acc, Math.min(Math.max(c.racks.length, 1), RACKS_PER_ROW)),
    1,
  );
  const width = ROOM_PADDING * 2 + maxCols * RACK_W + (maxCols - 1) * RACK_GAP;
  const height = y + ROOM_PADDING;

  return { width, height, corridorLayouts };
}

// ─── Power utilization color helpers ─────────────────────────────────────────

function powerColor(pct: number | null | undefined): string {
  if (pct == null) return '#64748b';
  if (pct >= 90) return '#ef4444';
  if (pct >= 75) return '#f97316';
  if (pct >= 50) return '#eab308';
  return '#22c55e';
}

// ─── Context for React Flow node callbacks ───────────────────────────────────

interface FloorPlanCallbacks {
  onAddCorridor: (room: FloorPlanRoom) => void;
  onAddRack: (room: FloorPlanRoom, corridor: FloorPlanCorridor) => void;
  onRackClick: (room: FloorPlanRoom, rack: FloorPlanRack) => void;
  onRoomClick: ((room: FloorPlanRoom) => void) | null;
}

const FloorPlanCallbacksCtx = createContext<FloorPlanCallbacks>({
  onAddCorridor: () => {},
  onAddRack: () => {},
  onRackClick: () => {},
  onRoomClick: null,
});

// ─── Node data types ──────────────────────────────────────────────────────────

interface RoomGroupData extends Record<string, unknown> {
  room: FloorPlanRoom;
  width: number;
  height: number;
  corridorLayouts: CorridorLayout[];
}

interface RackTileData extends Record<string, unknown> {
  rack: FloorPlanRack;
  room: FloorPlanRoom;
}

// ─── Room group node ──────────────────────────────────────────────────────────

const RoomGroupNode = memo(function RoomGroupNode({ data }: NodeProps<Node<RoomGroupData>>) {
  const { room, width, height, corridorLayouts } = data;
  const { onAddCorridor, onAddRack } = useContext(FloorPlanCallbacksCtx);

  return (
    <div
      className="rounded-xl border-2 border-dashed border-slate-500 dark:border-slate-600 bg-slate-200/60 dark:bg-slate-800/50 relative"
      style={{ width, height }}
    >
      {/* Room header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-400 dark:border-slate-600">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
            {room.name}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">
            {room.corridors.length} corridor{room.corridors.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          type="button"
          className="nodrag nopan flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-medium bg-violet-600 hover:bg-violet-700 text-white rounded transition-colors shrink-0 ml-2"
          style={{ pointerEvents: 'all' }}
          title="Add Corridor"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onAddCorridor(room); }}
        >
          <Plus className="w-2.5 h-2.5" />
          Corridor
        </button>
      </div>

      {/* Corridor header strips — visual only, rendered as divs */}
      {corridorLayouts.map((layout) => (
        <div
          key={layout.corridor.id}
          className="absolute left-0 right-0 flex items-center justify-between px-3 bg-slate-300/70 dark:bg-slate-700/60 border-b border-slate-400/50 dark:border-slate-600/50"
          style={{ top: layout.headerY, height: CORRIDOR_HEADER_H }}
        >
          <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300 truncate">
            {layout.corridor.name}
          </span>
          <button
            type="button"
            className="nodrag nopan flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-medium bg-sky-600 hover:bg-sky-700 text-white rounded transition-colors shrink-0"
            style={{ pointerEvents: 'all' }}
            title="Add Rack"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onAddRack(room, layout.corridor); }}
          >
            <Plus className="w-2.5 h-2.5" />
            Rack
          </button>
        </div>
      ))}
    </div>
  );
});

// ─── Rack tile node ───────────────────────────────────────────────────────────

const RackTileNode = memo(function RackTileNode({ data, selected }: NodeProps<Node<RackTileData>>) {
  const { rack, room } = data;
  const { onRackClick } = useContext(FloorPlanCallbacksCtx);
  const pct = rack.power_utilization_pct;
  const uPct = rack.total_units > 0 ? Math.round((rack.used_units / rack.total_units) * 100) : 0;
  const accentColor = powerColor(pct);

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onRackClick(room, rack); }}
      className={[
        'nodrag nopan',
        'flex flex-col justify-between rounded-lg border-2 cursor-pointer select-none p-2',
        'bg-white dark:bg-slate-800 shadow-md transition-all hover:scale-[1.03] hover:shadow-lg',
        selected ? 'border-sky-500 ring-2 ring-sky-300' : 'border-slate-300 dark:border-slate-600',
      ].join(' ')}
      style={{ width: RACK_W, height: RACK_H, pointerEvents: 'all' }}
      title={`${rack.name} · ${rack.used_units}/${rack.total_units}U used${pct != null ? ` · ${Math.round(pct)}% power` : ''}`}
    >
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
  const [addCorridorTarget, setAddCorridorTarget] = useState<FloorPlanRoom | null>(null);
  const [addRackTarget, setAddRackTarget] = useState<{ room: FloorPlanRoom; corridor: FloorPlanCorridor } | null>(null);

  const handleAddCorridor = useCallback((room: FloorPlanRoom) => setAddCorridorTarget(room), []);
  const handleAddRack = useCallback((room: FloorPlanRoom, corridor: FloorPlanCorridor) => setAddRackTarget({ room, corridor }), []);

  const callbacks = useMemo<FloorPlanCallbacks>(
    () => ({ onAddCorridor: handleAddCorridor, onAddRack: handleAddRack, onRackClick, onRoomClick: null }),
    [handleAddCorridor, handleAddRack, onRackClick],
  );

  const nodes = useMemo<Node[]>(() => {
    if (!floorPlan) return [];
    const result: Node[] = [];
    let xOffset = 0;

    for (const room of floorPlan.rooms) {
      const { width: roomW, height: roomH, corridorLayouts } = computeRoomLayout(room.corridors);

      result.push({
        id: `room-${room.id}`,
        type: 'roomGroup',
        position: { x: xOffset, y: 0 },
        data: { room, width: roomW, height: roomH, corridorLayouts } as RoomGroupData,
        draggable: false,
        selectable: false,
        style: { width: roomW, height: roomH, zIndex: 0 },
      });

      // Rack tile nodes positioned within corridors inside the room
      for (const layout of corridorLayouts) {
        layout.corridor.racks.forEach((rack: FloorPlanRack, i: number) => {
          const col = i % RACKS_PER_ROW;
          const row = Math.floor(i / RACKS_PER_ROW);
          result.push({
            id: `rack-${rack.id}`,
            type: 'rackTile',
            parentId: `room-${room.id}`,
            extent: 'parent',
            position: {
              x: ROOM_PADDING + col * (RACK_W + RACK_GAP),
              y: layout.racksStartY + row * (RACK_H + RACK_GAP),
            },
            data: { rack, room } as RackTileData,
            style: { width: RACK_W, height: RACK_H, zIndex: 10 },
          });
        });
      }

      xOffset += roomW + ROOM_GAP;
    }

    return result;
  }, [floorPlan]);

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
    <FloorPlanCallbacksCtx.Provider value={callbacks}>
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
          nodesDraggable={false}
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

        {addCorridorTarget && (
          <AddCorridorModal
            roomId={addCorridorTarget.id}
            roomName={addCorridorTarget.name}
            onClose={() => setAddCorridorTarget(null)}
          />
        )}
        {addRackTarget && (
          <AddRackModal
            corridorId={addRackTarget.corridor.id}
            corridorName={addRackTarget.corridor.name}
            onClose={() => setAddRackTarget(null)}
          />
        )}
      </div>
    </FloorPlanCallbacksCtx.Provider>
  );
}

export function RoomFloorPlan(props: Props) {
  return (
    <ReactFlowProvider>
      <RoomFloorPlanInner {...props} />
    </ReactFlowProvider>
  );
}
