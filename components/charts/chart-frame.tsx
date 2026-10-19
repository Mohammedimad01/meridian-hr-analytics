import { cn } from "@/lib/utils";

/**
 * Wraps a chart with HTML axis titles (units included), so labels never
 * collide with ticks and stay crisp in both themes. `summary` is announced
 * to screen readers in place of the SVG.
 */
export function ChartFrame({
  yLabel,
  xLabel,
  summary,
  legend,
  className,
  children,
}: {
  yLabel?: string;
  xLabel?: string;
  summary: string;
  legend?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <figure className={cn("flex min-w-0 flex-col gap-1", className)}>
      {(yLabel || legend) && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{yLabel}</span>
          {legend}
        </div>
      )}
      <div role="img" aria-label={summary} className="min-w-0">
        {children}
      </div>
      {xLabel && <figcaption className="text-center text-xs text-muted-foreground">{xLabel}</figcaption>}
    </figure>
  );
}

export function LegendItem({
  color,
  label,
  shape = "square",
}: {
  color: string;
  label: string;
  shape?: "square" | "line" | "dashed";
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      {shape === "square" && <span className="size-2.5 rounded-[2px]" style={{ background: color }} aria-hidden />}
      {shape === "line" && <span className="h-0.5 w-3 rounded-full" style={{ background: color }} aria-hidden />}
      {shape === "dashed" && <span className="w-3 border-t-2 border-dashed" style={{ borderColor: color }} aria-hidden />}
      {label}
    </span>
  );
}

export function Legend({ children }: { children: React.ReactNode }) {
  return <span className="flex flex-wrap items-center gap-3">{children}</span>;
}
