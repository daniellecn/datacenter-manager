import { cn } from "@/lib/utils";

type Variant = "default" | "success" | "warning" | "danger" | "info" | "muted";

const variants: Record<Variant, string> = {
  default: "bg-gray-100 text-gray-700",
  success: "bg-green-100 text-green-700",
  warning: "bg-yellow-100 text-yellow-700",
  danger: "bg-red-100 text-red-700",
  info: "bg-blue-100 text-blue-700",
  muted: "bg-gray-50 text-gray-500",
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

// Semantic helpers
export function statusVariant(status: string): Variant {
  const s = status?.toLowerCase();
  if (["active", "running", "up", "ok", "success", "in_use"].includes(s)) return "success";
  if (["warning", "partial", "maintenance"].includes(s)) return "warning";
  if (["inactive", "decommissioned", "admin_down", "down", "error", "failed", "deprecated"].includes(s)) return "danger";
  if (["spare", "reserved", "stopped", "planned"].includes(s)) return "info";
  return "default";
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={statusVariant(status)}>{status.replace(/_/g, " ")}</Badge>;
}

export function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, Variant> = { critical: "danger", warning: "warning", info: "info" };
  return <Badge variant={map[severity] ?? "default"}>{severity}</Badge>;
}
