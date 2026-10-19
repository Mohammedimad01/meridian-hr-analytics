"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sparkline } from "@/components/charts/sparkline";
import { cn } from "@/lib/utils";

export interface KpiProps {
  label: string;
  value: string;
  /** Formatted change, e.g. "+12" or "−1.4 pp". */
  delta: string | null;
  /** Raw change, used for the arrow direction. */
  deltaValue: number | null;
  /** Whether an increase is good. Announced to screen readers. */
  higherIsBetter: boolean;
  comparison: string;
  definition: string;
  spark: (number | null)[];
  sparkLabel: string;
}

export function KpiCard(p: KpiProps) {
  const dir = p.deltaValue === null || Math.abs(p.deltaValue) < 1e-9 ? 0 : p.deltaValue > 0 ? 1 : -1;
  const Arrow = dir > 0 ? ArrowUpRight : dir < 0 ? ArrowDownRight : ArrowRight;
  const reading = dir === 0 ? "no change" : dir > 0 === p.higherIsBetter ? "favourable" : "unfavourable";
  return (
    <div className="flex min-w-0 flex-col gap-1.5 bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-xs font-medium text-muted-foreground">{p.label}</h3>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="-m-1 rounded p-1 text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`How ${p.label} is calculated`}
            >
              <Info className="size-3.5" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-64 text-xs leading-relaxed">
            {p.definition}
          </TooltipContent>
        </Tooltip>
      </div>
      <p className="num text-2xl leading-8 font-semibold tracking-tight text-foreground md:text-[1.75rem] md:leading-9">
        {p.value}
      </p>
      <p className="min-h-4 text-xs text-muted-foreground">
        {p.delta === null ? (
          <span>No comparison period</span>
        ) : (
          <>
            <span className="num inline-flex items-center gap-0.5 font-medium text-foreground">
              <Arrow className="size-3.5" aria-hidden />
              {p.delta}
            </span>{" "}
            <span>{p.comparison}</span>
            <span className="sr-only"> ({reading})</span>
          </>
        )}
      </p>
      <div className="mt-1">
        <Sparkline data={p.spark} label={p.sparkLabel} />
      </div>
    </div>
  );
}

export function KpiRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-px overflow-hidden rounded-lg border bg-border min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
