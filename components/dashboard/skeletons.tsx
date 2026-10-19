import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function KpiRowSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-3 xl:grid-cols-6" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3 bg-card p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-3 w-full" />
        </div>
      ))}
    </div>
  );
}

export function PanelSkeleton({ className, height = 240 }: { className?: string; height?: number }) {
  return (
    <div className={cn("rounded-lg border bg-card p-4", className)} aria-hidden>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-2 h-3 w-64 max-w-full" />
      <Skeleton className="mt-4 w-full" style={{ height }} />
    </div>
  );
}

export function PageSkeleton({ kpis = 0, panels = 4 }: { kpis?: number; panels?: number }) {
  return (
    <div className="space-y-4" role="status" aria-label="Loading report">
      {kpis > 0 && <KpiRowSkeleton count={kpis} />}
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: panels }, (_, i) => (
          <PanelSkeleton key={i} />
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
