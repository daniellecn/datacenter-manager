/**
 * Slide-in side panel showing a device's summary and a link to its full detail page.
 * Used at rack level (RackElevationDevice) and chassis level (DeviceRead as blade).
 */

import { useNavigate } from 'react-router-dom';
import { X, ExternalLink, MapPin, Cpu, Zap } from 'lucide-react';
import type { DeviceType } from '@/types/topology';
import { DeviceIcon, DEVICE_COLORS, STATUS_DOT } from '@/components/topology/icons';

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

export function DeviceDetailPanel({ device, onClose }: Props) {
  const navigate = useNavigate();
  const dt = safeType(device.device_type);
  const colors = DEVICE_COLORS[dt];
  const statusDot = STATUS_DOT[device.status] ?? STATUS_DOT.unknown;
  const vendorModel = [device.vendor ?? device.manufacturer, device.model].filter(Boolean).join(' · ');
  const uEnd =
    device.rack_unit_start != null && device.rack_unit_height != null
      ? device.rack_unit_start + device.rack_unit_height - 1
      : null;

  return (
    <div className="absolute right-0 top-0 h-full w-80 bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col z-50">
      {/* Header */}
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
        <button onClick={onClose} className="text-white/70 hover:text-white ml-2 shrink-0 mt-0.5">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Status */}
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${statusDot}`} />
          <span className="text-sm capitalize text-slate-700 dark:text-slate-300">{device.status}</span>
        </div>

        {/* U position */}
        {device.rack_unit_start != null && uEnd != null && (
          <InfoRow icon={<MapPin className="w-4 h-4" />}>
            U{device.rack_unit_start}–U{uEnd}
            <span className="ml-1.5 text-xs text-slate-400">({device.rack_unit_height}U)</span>
          </InfoRow>
        )}

        {/* Vendor / Model */}
        {vendorModel && (
          <InfoRow icon={<Cpu className="w-4 h-4" />}>{vendorModel}</InfoRow>
        )}

        {/* Power */}
        {(device.power_rated_w || device.power_actual_w) && (
          <InfoRow icon={<Zap className="w-4 h-4" />}>
            {device.power_actual_w != null && (
              <span>{device.power_actual_w}W actual</span>
            )}
            {device.power_actual_w != null && device.power_rated_w != null && (
              <span className="text-slate-300 dark:text-slate-600 mx-1">/</span>
            )}
            {device.power_rated_w != null && (
              <span className="text-slate-400">{device.power_rated_w}W rated</span>
            )}
          </InfoRow>
        )}
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
  );
}

function InfoRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
      <span className="shrink-0 mt-0.5">{icon}</span>
      <span className="flex flex-wrap items-center gap-x-1">{children}</span>
    </div>
  );
}
