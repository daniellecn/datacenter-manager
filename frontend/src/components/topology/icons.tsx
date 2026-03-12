// SVG icon components for each device type.
// All icons are 24×24 viewBox, filled with currentColor.

import type { ComponentType } from "react";
import type { DeviceType } from "@/types/topology";

interface IconProps {
  className?: string;
  size?: number;
}

export function ServerIcon({ className, size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="4" width="20" height="6" rx="1" fill="currentColor" opacity="0.9" />
      <rect x="2" y="12" width="20" height="6" rx="1" fill="currentColor" opacity="0.9" />
      <circle cx="19" cy="7" r="1.2" fill="white" />
      <circle cx="19" cy="15" r="1.2" fill="white" />
      <rect x="4" y="6" width="8" height="2" rx="0.5" fill="white" opacity="0.5" />
      <rect x="4" y="14" width="8" height="2" rx="0.5" fill="white" opacity="0.5" />
    </svg>
  );
}

export function SwitchIcon({ className, size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="8" width="20" height="8" rx="1" fill="currentColor" opacity="0.9" />
      {[4, 6.5, 9, 11.5, 14, 16.5].map((x) => (
        <rect key={x} x={x} y="11" width="1.5" height="2" rx="0.3" fill="white" opacity="0.7" />
      ))}
      <path d="M5 8 L5 5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 8 L8 5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M19 8 L19 5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function RouterIcon({ className, size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8" fill="currentColor" opacity="0.9" />
      <circle cx="12" cy="12" r="3" fill="white" opacity="0.8" />
      <path d="M12 4 L12 8" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 16 L12 20" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 12 L8 12" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 12 L20 12" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function FirewallIcon({ className, size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2 L20 6 L20 13 C20 17.4 16.4 21 12 22 C7.6 21 4 17.4 4 13 L4 6 Z" fill="currentColor" opacity="0.9" />
      <path d="M9 11 C9 9 11 8 12 10 C13 8 15 9 15 11 C15 13 13 14 12 16 C11 14 9 13 9 11 Z" fill="white" opacity="0.85" />
    </svg>
  );
}

export function StorageIcon({ className, size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx="12" cy="6" rx="9" ry="3" fill="currentColor" opacity="0.9" />
      <path d="M3 6 L3 18 C3 19.66 7.03 21 12 21 C16.97 21 21 19.66 21 18 L21 6" fill="currentColor" opacity="0.7" />
      <ellipse cx="12" cy="18" rx="9" ry="3" fill="currentColor" opacity="0.9" />
      <path d="M7 12 L17 12" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <circle cx="16" cy="9" r="1" fill="white" opacity="0.7" />
    </svg>
  );
}

export function PduIcon({ className, size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect x="5" y="3" width="14" height="18" rx="2" fill="currentColor" opacity="0.9" />
      <path d="M11 7 L11 10 L9 10 L13 17 L13 14 L15 14 Z" fill="white" opacity="0.85" />
    </svg>
  );
}

export function PatchPanelIcon({ className, size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="7" width="20" height="10" rx="1" fill="currentColor" opacity="0.9" />
      {[4, 7, 10, 13, 16, 19].map((x) => (
        <circle key={x} cx={x} cy="12" r="1.2" fill="white" opacity="0.7" />
      ))}
      <rect x="4" y="17" width="2" height="2" rx="0.3" fill="currentColor" opacity="0.5" />
      <rect x="8" y="17" width="2" height="2" rx="0.3" fill="currentColor" opacity="0.5" />
      <rect x="12" y="17" width="2" height="2" rx="0.3" fill="currentColor" opacity="0.5" />
      <rect x="16" y="17" width="2" height="2" rx="0.3" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

export function GenericDeviceIcon({ className, size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="6" width="18" height="12" rx="2" fill="currentColor" opacity="0.9" />
      <circle cx="12" cy="12" r="3" fill="white" opacity="0.7" />
      <circle cx="19" cy="9" r="1.2" fill="white" opacity="0.6" />
    </svg>
  );
}

export function BladeChassisIcon({ className, size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="2" y="3" width="20" height="18" rx="1.5" fill="currentColor" opacity="0.9" />
      {[5, 8, 11, 14, 17].map((y) => (
        <rect key={y} x="4" y={y} width="16" height="1.8" rx="0.5" fill="white" opacity="0.55" />
      ))}
      <rect x="18" y="4" width="2" height="16" rx="0.5" fill="white" opacity="0.25" />
    </svg>
  );
}

export function BladeIcon({ className, size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="2" y="7" width="20" height="10" rx="1" fill="currentColor" opacity="0.9" />
      <rect x="4" y="10" width="10" height="1.5" rx="0.4" fill="white" opacity="0.55" />
      <rect x="4" y="13" width="6" height="1.5" rx="0.4" fill="white" opacity="0.4" />
      <circle cx="20" cy="12" r="1.2" fill="white" opacity="0.7" />
    </svg>
  );
}

// ─── Map device type to icon component ───────────────────────────────────────

export const DEVICE_ICON_MAP: Record<DeviceType, ComponentType<IconProps>> = {
  server: ServerIcon,
  switch: SwitchIcon,
  router: RouterIcon,
  firewall: FirewallIcon,
  storage: StorageIcon,
  pdu: PduIcon,
  patch_panel: PatchPanelIcon,
  blade_chassis: BladeChassisIcon,
  blade: BladeIcon,
  generic: GenericDeviceIcon,
};

export function DeviceIcon({
  deviceType,
  ...props
}: IconProps & { deviceType: DeviceType }) {
  const Icon = DEVICE_ICON_MAP[deviceType] ?? GenericDeviceIcon;
  return <Icon {...props} />;
}

// ─── Color scheme per device type ────────────────────────────────────────────

export const DEVICE_COLORS: Record<DeviceType, { bg: string; border: string; text: string }> = {
  server:        { bg: "bg-blue-600",   border: "border-blue-700",   text: "text-blue-600"   },
  switch:        { bg: "bg-green-600",  border: "border-green-700",  text: "text-green-600"  },
  router:        { bg: "bg-purple-600", border: "border-purple-700", text: "text-purple-600" },
  firewall:      { bg: "bg-red-600",    border: "border-red-700",    text: "text-red-600"    },
  storage:       { bg: "bg-orange-500", border: "border-orange-600", text: "text-orange-500" },
  pdu:           { bg: "bg-yellow-500", border: "border-yellow-600", text: "text-yellow-600" },
  patch_panel:   { bg: "bg-slate-500",  border: "border-slate-600",  text: "text-slate-500"  },
  blade_chassis: { bg: "bg-slate-700",  border: "border-slate-800",  text: "text-slate-600"  },
  blade:         { bg: "bg-indigo-600", border: "border-indigo-700", text: "text-indigo-600" },
  generic:       { bg: "bg-gray-500",   border: "border-gray-600",   text: "text-gray-500"   },
};

// ─── Status dot colors ────────────────────────────────────────────────────────

export const STATUS_DOT: Record<string, string> = {
  active:      "bg-emerald-400",
  inactive:    "bg-gray-400",
  maintenance: "bg-amber-400",
  unknown:     "bg-gray-300",
};

// ─── Link-type color ──────────────────────────────────────────────────────────

export const LINK_COLORS: Record<string, string> = {
  ethernet:  "#3b82f6",  // blue-500
  fiber:     "#a855f7",  // purple-500
  dac:       "#14b8a6",  // teal-500
  lag:       "#f59e0b",  // amber-500
  console:   "#6b7280",  // gray-500
  power:     "#ef4444",  // red-500
  other:     "#9ca3af",  // gray-400
};

// ─── Speed label helper ───────────────────────────────────────────────────────

export function speedLabel(mbps: number | null | undefined): string {
  if (!mbps) return "";
  if (mbps >= 1_000_000) return `${mbps / 1_000_000}T`;
  if (mbps >= 1_000)     return `${mbps / 1_000}G`;
  return `${mbps}M`;
}
