/**
 * Slide-in side panel — fixed to the right edge of the viewport.
 *
 * Opens immediately with the data already available from the rack elevation
 * response, then enriches with the full device record (serial number,
 * management IP, last seen) fetched from GET /devices/{id}.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  ExternalLink,
  MapPin,
  Cpu,
  Zap,
  Hash,
  Network,
  Clock,
  Loader2,
} from 'lucide-react';
import type { DeviceType } from '@/types/topology';
import { DeviceIcon, DEVICE_COLORS, STATUS_DOT } from '@/components/topology/icons';
import { useDevice } from '@/api/devices';

export interface DevicePanelInfo {
  id: string;
  name: string;
  device_type: string;
  status: string;
  rack_unit_start?: number | null;
  rack_unit_height?: number | null;
  power_rated_w?: number | null;
  power_actual_w?: number | null;
  model?: string | null;
  vendor?: string | null;
  manufacturer?: string | null;
}

interface Props {
  device: DevicePanelInfo;
  onClose: () => void;
}

const KNOWN_TYPES: DeviceType[] = [
  'server', 'switch', 'router', 'firewall', 'storage',
  'pdu', 'patch_panel', 'blade_chassis', 'blade', 'generic',
];

function safeType(t: string): DeviceType {
  return KNOWN_TYPES.includes(t as DeviceType) ? (t as DeviceType) : 'generic';
}

function fmt(d: string | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  const day = String(dt.getDate()).padStart(2, '0');
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${dt.getFullYear()} ${hh}:${mm}`;
}

export function DeviceDetailPanel({ device, onClose }: Props) {
  const navigate = useNavigate();
  const dt = safeType(device.device_type);
  const colors = DEVICE_COLORS[dt];
  const statusDot = STATUS_DOT[device.status] ?? STATUS_DOT.unknown;

  // Fetch the full device record to get serial number, management IP, last seen
  const { data: full, isLoading: enriching } = useDevice(device.id);

  // Close on Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const manufacturer = full?.manufacturer ?? device.manufacturer ?? device.vendor;
  const model = full?.model ?? device.model;
  const serialNumber = full?.serial_number;
  const managementIp = full?.management_ip;
  const lastSeen = full?.last_seen_at;

  const uEnd =
    device.rack_unit_start != null && device.rack_unit_height != null
      ? device.rack_unit_start + device.rack_unit_height - 1
      : null;

  const powerActual = full?.power_actual_w ?? device.power_actual_w;
  const powerRated = full?.power_rated_w ?? device.power_rated_w;

  return (
    <>
      {/* Backdrop — clicking it closes the panel */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel — fixed to right edge of viewport */}
      <div className="fixed right-0 top-0 h-full w-80 bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col z-50">
        {/* Coloured header */}
        <div className={`${colors.bg} px-4 py-3 flex items-start justify-between shrink-0`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <DeviceIcon deviceType={dt} size={18} className="text-white shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-white/70 capitalize leading-none mb-0.5">
                {device.device_type.replace(/_/g, ' ')}
              </p>
              <p className="text-sm font-bold text-white leading-tight truncate" title={device.name}>
                {device.name}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-white/70 hover:text-white ml-2 shrink-0 mt-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {/* Status */}
          <div className="flex items-center gap-2 pb-1 border-b border-slate-100 dark:border-slate-800">
            <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${statusDot}`} />
            <span className="text-sm capitalize font-medium text-slate-700 dark:text-slate-300">
              {device.status}
            </span>
          </div>

          {/* Rack position */}
          {device.rack_unit_start != null && uEnd != null && (
            <InfoRow icon={<MapPin className="w-3.5 h-3.5" />} label="Rack position">
              U{device.rack_unit_start}–U{uEnd}
              <span className="ml-1 text-xs text-slate-400">({device.rack_unit_height}U)</span>
            </InfoRow>
          )}

          {/* Manufacturer */}
          {manufacturer && (
            <InfoRow icon={<Cpu className="w-3.5 h-3.5" />} label="Manufacturer">
              {manufacturer}
            </InfoRow>
          )}

          {/* Model */}
          {model && (
            <InfoRow icon={<Cpu className="w-3.5 h-3.5" />} label="Model">
              {model}
            </InfoRow>
          )}

          {/* Serial number — show skeleton while enriching */}
          <InfoRow icon={<Hash className="w-3.5 h-3.5" />} label="Serial number">
            {enriching ? (
              <span className="flex items-center gap-1 text-slate-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="text-xs">Loading…</span>
              </span>
            ) : (
              <span className={serialNumber ? '' : 'text-slate-400'}>
                {serialNumber ?? '—'}
              </span>
            )}
          </InfoRow>

          {/* Management IP */}
          <InfoRow icon={<Network className="w-3.5 h-3.5" />} label="Management IP">
            {enriching ? (
              <span className="flex items-center gap-1 text-slate-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="text-xs">Loading…</span>
              </span>
            ) : (
              <span className={managementIp ? 'font-mono text-xs' : 'text-slate-400'}>
                {managementIp ?? '—'}
              </span>
            )}
          </InfoRow>

          {/* Power */}
          {(powerRated || powerActual) && (
            <InfoRow icon={<Zap className="w-3.5 h-3.5" />} label="Power">
              {powerActual != null && <span>{powerActual}W actual</span>}
              {powerActual != null && powerRated != null && (
                <span className="text-slate-400 mx-1">/</span>
              )}
              {powerRated != null && (
                <span className="text-slate-400">{powerRated}W rated</span>
              )}
            </InfoRow>
          )}

          {/* Last seen */}
          <InfoRow icon={<Clock className="w-3.5 h-3.5" />} label="Last seen">
            {enriching ? (
              <span className="flex items-center gap-1 text-slate-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="text-xs">Loading…</span>
              </span>
            ) : (
              <span className={lastSeen ? '' : 'text-slate-400'}>
                {fmt(lastSeen)}
              </span>
            )}
          </InfoRow>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 shrink-0">
          <button
            onClick={() => navigate(`/devices/${device.id}`)}
            className="w-full flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Open full detail
          </button>
        </div>
      </div>
    </>
  );
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="shrink-0 mt-0.5 text-slate-400 dark:text-slate-500">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wide font-medium text-slate-400 dark:text-slate-500 mb-0.5">
          {label}
        </p>
        <div className="text-sm text-slate-700 dark:text-slate-300 flex flex-wrap items-center gap-x-1">
          {children}
        </div>
      </div>
    </div>
  );
}
