/**
 * useExportTopologyPdf
 *
 * Fetches floor-plan + rack-elevation data and draws everything to an
 * HTML <canvas> using only the 2D API — zero external dependencies.
 * Downloads the result as a PNG file the user can print or keep.
 */

import { useState } from "react";
import api from "@/api";
import type {
  FloorPlanResponse,
  FloorPlanRoom,
  FloorPlanRack,
  RackElevationResponse,
} from "@/types/topology";

// ─── Constants ───────────────────────────────────────────────────────────────

const W          = 1240;   // canvas width (px)
const MARGIN     = 48;
const CONTENT_W  = W - MARGIN * 2;
const U_H        = 22;     // px per rack unit in elevation diagram
const ELEV_W     = 260;    // width of the elevation diagram column
const FONT       = "system-ui, Arial, sans-serif";

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface RackCtx {
  rack: FloorPlanRack;
  roomName: string;
  corridorName: string;
}

function collectRacks(rooms: FloorPlanRoom[]): RackCtx[] {
  return rooms.flatMap((room) =>
    room.corridors.flatMap((corridor) =>
      corridor.racks.map((rack) => ({
        rack,
        roomName: room.name,
        corridorName: corridor.name,
      }))
    )
  );
}

const TYPE_LABEL: Record<string, string> = {
  server: "SERVER", switch: "SWITCH", router: "ROUTER", firewall: "FW",
  storage: "STORAGE", pdu: "PDU", patch_panel: "PATCH",
  blade_chassis: "CHASSIS", blade: "BLADE", generic: "DEV",
};

const TYPE_BG: Record<string, string> = {
  server: "#dbeafe", switch: "#d1fae5", router: "#dcfce7", firewall: "#fef3c7",
  storage: "#ede9fe", pdu: "#fef9c3", patch_panel: "#f3f4f6",
  blade_chassis: "#e0f2fe", blade: "#bfdbfe", generic: "#f9fafb",
};

function utilizationColor(pct: number | null) {
  const p = pct ?? 0;
  if (p >= 90) return "#fca5a5";
  if (p >= 75) return "#fde68a";
  if (p >= 50) return "#93c5fd";
  return "#86efac";
}

function statusColor(status: string) {
  if (status === "active")      return "#059669";
  if (status === "maintenance") return "#d97706";
  return "#9ca3af";
}

/** Draw text clipped to maxWidth, returns true if it fit */
function clipText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y - 14, maxWidth, 18);
  ctx.clip();
  ctx.fillText(text, x, y, maxWidth);
  ctx.restore();
}

// ─── Canvas drawing sections ──────────────────────────────────────────────────

/** Returns the Y coordinate after this section */
function drawCover(
  ctx: CanvasRenderingContext2D,
  fp: FloorPlanResponse,
  allRacks: RackCtx[],
  y: number
): number {
  const allRackList = fp.rooms.flatMap((r) => r.corridors.flatMap((c) => c.racks));
  const totalDevices = allRackList.reduce((s, r) => s + r.device_count, 0);

  // Title
  ctx.fillStyle = "#0f172a";
  ctx.font = `bold 32px ${FONT}`;
  ctx.fillText(fp.name, MARGIN, y + 32);
  y += 44;

  // Subtitle
  ctx.fillStyle = "#64748b";
  ctx.font = `14px ${FONT}`;
  ctx.fillText(
    `Datacenter Topology  ·  Exported ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`,
    MARGIN, y
  );
  y += 24;

  // Stats boxes
  const stats = [
    { label: "Rooms",   value: fp.rooms.length },
    { label: "Racks",   value: allRacks.length },
    { label: "Devices", value: totalDevices },
  ];
  const boxW = 120, boxH = 56, boxGap = 12;
  stats.forEach(({ label, value }, i) => {
    const bx = MARGIN + i * (boxW + boxGap);
    ctx.fillStyle = "#f1f5f9";
    roundRect(ctx, bx, y, boxW, boxH, 6);
    ctx.fill();
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    roundRect(ctx, bx, y, boxW, boxH, 6);
    ctx.stroke();
    ctx.fillStyle = "#1e40af";
    ctx.font = `bold 24px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(String(value), bx + boxW / 2, y + 32);
    ctx.fillStyle = "#64748b";
    ctx.font = `11px ${FONT}`;
    ctx.fillText(label, bx + boxW / 2, y + 48);
    ctx.textAlign = "left";
  });
  y += boxH + 20;

  // Legend
  ctx.fillStyle = "#6b7280";
  ctx.font = `bold 10px ${FONT}`;
  ctx.fillText("Power utilisation:", MARGIN, y);
  let lx = MARGIN + 126;
  [
    { color: "#86efac", label: "< 50%" },
    { color: "#93c5fd", label: "50–74%" },
    { color: "#fde68a", label: "75–89%" },
    { color: "#fca5a5", label: "≥ 90%" },
  ].forEach(({ color, label }) => {
    ctx.fillStyle = color;
    ctx.strokeStyle = "#d1d5db";
    ctx.lineWidth = 1;
    ctx.fillRect(lx, y - 9, 12, 12);
    ctx.strokeRect(lx, y - 9, 12, 12);
    ctx.fillStyle = "#6b7280";
    ctx.font = `10px ${FONT}`;
    ctx.fillText(label, lx + 15, y);
    lx += 15 + ctx.measureText(label).width + 14;
  });
  ctx.fillStyle = "#6b7280";
  ctx.font = `bold 10px ${FONT}`;
  ctx.fillText("Status:", lx, y);
  lx += ctx.measureText("Status:").width + 8;
  [
    { color: "#059669", label: "Active" },
    { color: "#d97706", label: "Maintenance" },
    { color: "#9ca3af", label: "Inactive" },
  ].forEach(({ color, label }) => {
    ctx.fillStyle = color;
    ctx.font = `12px ${FONT}`;
    ctx.fillText("●", lx, y);
    ctx.fillStyle = "#6b7280";
    ctx.font = `10px ${FONT}`;
    ctx.fillText(` ${label}`, lx + 14, y);
    lx += 14 + ctx.measureText(` ${label}`).width + 12;
  });
  y += 20;

  // Divider
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(MARGIN, y); ctx.lineTo(W - MARGIN, y); ctx.stroke();
  y += 16;

  return y;
}

/** Draw per-room rack grid overview */
function drawFloorPlan(ctx: CanvasRenderingContext2D, fp: FloorPlanResponse, y: number): number {
  for (const room of fp.rooms) {
    const allRoomRacks = room.corridors.flatMap((c) => c.racks);
    if (allRoomRacks.length === 0) continue;

    // Room header
    ctx.fillStyle = "#1e40af";
    ctx.font = `bold 13px ${FONT}`;
    ctx.fillText(room.name, MARGIN, y);
    ctx.strokeStyle = "#bfdbfe";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(MARGIN, y + 4); ctx.lineTo(W - MARGIN, y + 4); ctx.stroke();
    y += 18;

    for (const corridor of room.corridors) {
      if (corridor.racks.length === 0) continue;

      // Corridor label
      ctx.fillStyle = "#64748b";
      ctx.font = `10px ${FONT}`;
      ctx.fillText(corridor.name, MARGIN, y);
      y += 14;

      // Rack tiles
      const TILE_W = 110, TILE_H = 72, TILE_GAP = 8;
      let tx = MARGIN;
      let rowMaxH = 0;
      const rowStartY = y;

      corridor.racks.forEach((rack, idx) => {
        const pct = rack.power_utilization_pct ?? 0;
        const borderColor = utilizationColor(rack.power_utilization_pct);

        // Tile border
        ctx.fillStyle = "#ffffff";
        roundRect(ctx, tx, rowStartY, TILE_W, TILE_H, 4);
        ctx.fill();
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 2;
        roundRect(ctx, tx, rowStartY, TILE_W, TILE_H, 4);
        ctx.stroke();

        // Rack name
        ctx.fillStyle = "#1e293b";
        ctx.font = `bold 10px ${FONT}`;
        clipText(ctx, rack.name, tx + 6, rowStartY + 16, TILE_W - 12);

        // Stats
        ctx.fillStyle = "#64748b";
        ctx.font = `9px ${FONT}`;
        ctx.fillText(`${rack.used_units}/${rack.total_units} U · ${rack.device_count} dev`, tx + 6, rowStartY + 30);

        // Power bar background
        const barY = rowStartY + 40, barW = TILE_W - 12, barH = 4;
        ctx.fillStyle = "#e5e7eb";
        roundRect(ctx, tx + 6, barY, barW, barH, 2);
        ctx.fill();
        // Power bar fill
        ctx.fillStyle = borderColor;
        roundRect(ctx, tx + 6, barY, barW * Math.min(1, pct / 100), barH, 2);
        ctx.fill();

        // Pct label
        ctx.fillStyle = "#9ca3af";
        ctx.font = `8px ${FONT}`;
        ctx.fillText(`${pct.toFixed(0)}% power`, tx + 6, rowStartY + 58);

        tx += TILE_W + TILE_GAP;
        rowMaxH = TILE_H;

        // Wrap to next row
        if (tx + TILE_W > W - MARGIN && idx < corridor.racks.length - 1) {
          tx = MARGIN;
          y += rowMaxH + TILE_GAP;
          rowMaxH = 0;
        }
      });
      y += rowMaxH + 12;
    }
    y += 8;
  }
  return y;
}

/** Draw a single rack section (header + elevation diagram + device table) */
function drawRackSection(
  ctx: CanvasRenderingContext2D,
  rctx: RackCtx,
  elevation: RackElevationResponse,
  y: number
): number {
  const { rack, roomName, corridorName } = rctx;
  const sorted = [...elevation.devices].sort((a, b) => (a.rack_unit_start ?? 0) - (b.rack_unit_start ?? 0));

  // ── Section header bar ───────────────────────────────────────────────────
  ctx.fillStyle = "#1e40af";
  ctx.font = `bold 14px ${FONT}`;
  ctx.fillText(rack.name, MARGIN, y);

  const nameW = ctx.measureText(rack.name).width;
  ctx.fillStyle = "#64748b";
  ctx.font = `10px ${FONT}`;
  const breadcrumb = corridorName !== roomName ? `${roomName} › ${corridorName}` : roomName;
  ctx.fillText(breadcrumb, MARGIN + nameW + 10, y);

  const stats = `${rack.used_units}/${rack.total_units} U  ·  ${elevation.devices.length} devices`;
  ctx.fillStyle = "#6b7280";
  ctx.font = `10px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText(stats, W - MARGIN, y);
  ctx.textAlign = "left";

  y += 6;
  ctx.strokeStyle = "#1e40af";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(MARGIN, y); ctx.lineTo(W - MARGIN, y); ctx.stroke();
  y += 10;

  const sectionTop = y;

  // ── Elevation diagram (left column) ─────────────────────────────────────
  const elevH = elevation.total_units * U_H;
  const U_NUM_W = 28;  // width of U-number strip

  // Outer border
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(MARGIN, sectionTop, ELEV_W, elevH);
  ctx.strokeStyle = "#9ca3af";
  ctx.lineWidth = 1;
  ctx.strokeRect(MARGIN, sectionTop, ELEV_W, elevH);

  // U-number strip
  ctx.fillStyle = "#f1f5f9";
  ctx.fillRect(MARGIN, sectionTop, U_NUM_W, elevH);
  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(MARGIN + U_NUM_W, sectionTop); ctx.lineTo(MARGIN + U_NUM_W, sectionTop + elevH); ctx.stroke();

  for (let i = 0; i < elevation.total_units; i++) {
    const uy = sectionTop + i * U_H;
    // Grid line
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(MARGIN + U_NUM_W, uy + U_H); ctx.lineTo(MARGIN + ELEV_W, uy + U_H); ctx.stroke();
    // U number
    ctx.fillStyle = "#9ca3af";
    ctx.font = `8px ${FONT}`;
    ctx.textAlign = "right";
    ctx.fillText(String(i + 1), MARGIN + U_NUM_W - 3, uy + U_H - 6);
  }
  ctx.textAlign = "left";

  // Device tiles
  for (const device of sorted) {
    const dTop  = sectionTop + ((device.rack_unit_start ?? 1) - 1) * U_H;
    const dH    = (device.rack_unit_height ?? 1) * U_H;
    const dx    = MARGIN + U_NUM_W + 2;
    const dw    = ELEV_W - U_NUM_W - 4;
    const bg    = TYPE_BG[device.device_type] ?? "#f9fafb";
    const label = TYPE_LABEL[device.device_type] ?? "DEV";

    ctx.fillStyle = bg;
    roundRect(ctx, dx, dTop + 1, dw, dH - 2, 2);
    ctx.fill();
    ctx.strokeStyle = "#9ca3af";
    ctx.lineWidth = 0.8;
    roundRect(ctx, dx, dTop + 1, dw, dH - 2, 2);
    ctx.stroke();

    // Type badge
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    roundRect(ctx, dx + 2, dTop + 3, ctx.measureText(label).width + 6, 12, 2);
    ctx.fill();
    ctx.fillStyle = "#374151";
    ctx.font = `bold 7px monospace`;
    ctx.fillText(label, dx + 4, dTop + 13);

    // Name
    const nameX = dx + ctx.measureText(label).width + 12;
    ctx.fillStyle = "#111827";
    ctx.font = `bold 8px ${FONT}`;
    clipText(ctx, device.name, nameX, dTop + 13, dw - (nameX - dx) - 20);

    // Status dot
    ctx.fillStyle = statusColor(device.status);
    ctx.font = `9px ${FONT}`;
    ctx.textAlign = "right";
    ctx.fillText("●", MARGIN + ELEV_W - 4, dTop + 13);
    ctx.textAlign = "left";

    // Model (if tall enough)
    if (dH >= U_H * 2 && device.model) {
      ctx.fillStyle = "#6b7280";
      ctx.font = `7px ${FONT}`;
      const modelStr = [device.vendor, device.model].filter(Boolean).join(" ");
      clipText(ctx, modelStr, nameX, dTop + 22, dw - (nameX - dx) - 10);
    }
  }

  // ── Device table (right of diagram) ────────────────────────────────────
  const tableX = MARGIN + ELEV_W + 16;
  const tableW = CONTENT_W - ELEV_W - 16;
  const ROW_H  = 20;
  const COLS: { label: string; w: number; key: keyof typeof sorted[0] | "model_combined" }[] = [
    { label: "U",            w: 0.06 },
    { label: "Name",         w: 0.30 },
    { label: "Type",         w: 0.14 },
    { label: "Vendor / Model", w: 0.34 },
    { label: "Status",       w: 0.16 },
  ].map((c) => ({ ...c, w: Math.floor(c.w * tableW) })) as typeof COLS;

  // Header
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(tableX, sectionTop, tableW, ROW_H);
  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 0.8;
  ctx.strokeRect(tableX, sectionTop, tableW, ROW_H);
  ctx.fillStyle = "#374151";
  ctx.font = `bold 9px ${FONT}`;
  let cx = tableX + 4;
  COLS.forEach((col) => {
    ctx.fillText(col.label, cx, sectionTop + 13, col.w - 6);
    cx += col.w;
  });

  // Rows
  sorted.forEach((device, i) => {
    const ry = sectionTop + ROW_H * (i + 1);
    ctx.fillStyle = i % 2 === 0 ? "#ffffff" : "#f9fafb";
    ctx.fillRect(tableX, ry, tableW, ROW_H);
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 0.5;
    ctx.strokeRect(tableX, ry, tableW, ROW_H);

    const cells = [
      device.rack_unit_start != null ? `U${device.rack_unit_start}` : "—",
      device.name,
      TYPE_LABEL[device.device_type] ?? device.device_type,
      [device.vendor, device.model].filter(Boolean).join(" ") || "—",
      device.status,
    ];

    ctx.font = `9px ${FONT}`;
    let ccx = tableX + 4;
    COLS.forEach((col, ci) => {
      if (ci === 1) ctx.font = `bold 9px ${FONT}`;
      else if (ci === 4) ctx.fillStyle = statusColor(device.status);
      else if (ci === 3) { ctx.fillStyle = "#6b7280"; ctx.font = `9px ${FONT}`; }
      else { ctx.fillStyle = "#374151"; ctx.font = `9px ${FONT}`; }
      clipText(ctx, cells[ci], ccx, ry + 13, col.w - 6);
      ccx += col.w;
    });
    ctx.fillStyle = "#374151"; // reset
  });

  if (sorted.length === 0) {
    ctx.fillStyle = "#9ca3af";
    ctx.font = `9px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText("Empty rack", tableX + tableW / 2, sectionTop + ROW_H + 13);
    ctx.textAlign = "left";
  }

  const tableBottom = sectionTop + ROW_H * (sorted.length + 1);
  y = Math.max(sectionTop + elevH, tableBottom) + 28;

  // Section divider
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(MARGIN, y - 14); ctx.lineTo(W - MARGIN, y - 14); ctx.stroke();
  ctx.setLineDash([]);

  return y;
}

// ─── Canvas helper: roundRect polyfill ───────────────────────────────────────

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

// ─── Height estimation (two-pass rendering) ───────────────────────────────────

function estimateHeight(fp: FloorPlanResponse, rackContexts: RackCtx[], elevationMap: Map<string, RackElevationResponse>): number {
  let h = 260; // cover
  // Floor plan
  for (const room of fp.rooms) {
    if (room.corridors.every((c) => c.racks.length === 0)) continue;
    h += 22;
    for (const corridor of room.corridors) {
      if (corridor.racks.length === 0) continue;
      h += 14;
      const rows = Math.ceil(corridor.racks.length / Math.floor((CONTENT_W + 8) / 118));
      h += rows * 80;
    }
    h += 8;
  }
  h += 20;
  // Rack sections
  for (const rc of rackContexts) {
    const elev = elevationMap.get(rc.rack.id);
    if (!elev) continue;
    const elevH  = elev.total_units * U_H;
    const tableH = (elev.devices.length + 1) * 20;
    h += Math.max(elevH, tableH) + 50;
  }
  return h + MARGIN;
}

// ─── Main canvas render + download ───────────────────────────────────────────

function renderAndDownload(
  fp: FloorPlanResponse,
  rackContexts: RackCtx[],
  elevationMap: Map<string, RackElevationResponse>,
  filename: string
) {
  const totalH = estimateHeight(fp, rackContexts, elevationMap);

  const canvas = document.createElement("canvas");
  canvas.width  = W;
  canvas.height = totalH;

  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, totalH);

  let y = MARGIN;
  y = drawCover(ctx, fp, rackContexts, y);
  y = drawFloorPlan(ctx, fp, y);

  // Section break before racks
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(MARGIN, y); ctx.lineTo(W - MARGIN, y); ctx.stroke();
  y += 24;

  for (const rc of rackContexts) {
    const elev = elevationMap.get(rc.rack.id);
    if (!elev) continue;
    y = drawRackSection(ctx, rc, elev, y);
  }

  // Download
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a   = document.createElement("a");
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export type ExportStatus = "idle" | "fetching" | "rendering" | "done" | "error";

export function useExportTopologyPdf() {
  const [status, setStatus] = useState<ExportStatus>("idle");
  const [error, setError]   = useState<string | null>(null);

  async function exportPdf(datacenterId: string, datacenterName: string) {
    setStatus("fetching");
    setError(null);
    try {
      // 1. Floor plan
      const fp: FloorPlanResponse = await api
        .get("/topology/floor-plan", { params: { datacenter_id: datacenterId } })
        .then((r) => r.data);

      const rackContexts = collectRacks(fp.rooms);

      // 2. All rack elevations in parallel
      const elevationResults = await Promise.all(
        rackContexts.map(({ rack }) =>
          api.get<RackElevationResponse>(`/racks/${rack.id}/elevation`).then((r) => r.data)
        )
      );
      const elevationMap = new Map<string, RackElevationResponse>();
      rackContexts.forEach(({ rack }, i) => elevationMap.set(rack.id, elevationResults[i]));

      // 3. Draw to canvas and download
      setStatus("rendering");
      const safeName = datacenterName.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      renderAndDownload(fp, rackContexts, elevationMap, `${safeName}_topology.png`);

      setStatus("done");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (e) {
      setError(String(e));
      setStatus("error");
      setTimeout(() => setStatus("idle"), 5000);
    }
  }

  return { exportPdf, status, error };
}
