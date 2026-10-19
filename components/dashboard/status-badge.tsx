import { AlertCircle, CheckCircle2, CircleDashed, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusTone = "danger" | "warning" | "success" | "neutral";

const TONE: Record<StatusTone, string> = {
  danger: "border-danger-border bg-danger-subtle text-danger",
  warning: "border-warning-border bg-warning-subtle text-warning",
  success: "border-success-border bg-success-subtle text-success",
  neutral: "border-border bg-muted text-muted-foreground",
};

const ICON = {
  danger: AlertCircle,
  warning: Clock,
  success: CheckCircle2,
  neutral: CircleDashed,
} as const;

/** Status colour always ships with an icon and a text label, never colour alone. */
export function StatusBadge({ tone, children, className }: { tone: StatusTone; children: React.ReactNode; className?: string }) {
  const Icon = ICON[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {children}
    </span>
  );
}
