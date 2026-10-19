"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { TipCard, type TipModel } from "./tooltip";

export interface HeatCell {
  row: string;
  col: string;
  value: number | null;
  /** Rendered in the cell; null shows an en dash. */
  label: string | null;
  tooltip: TipModel;
}

/** Single-hue sequential scale (teal), light to dark. */
const STEPS = [
  "bg-[var(--heat-1)] text-foreground",
  "bg-[var(--heat-2)] text-foreground",
  "bg-[var(--heat-3)] text-foreground",
  "bg-[var(--heat-4)] text-white dark:text-foreground",
  "bg-[var(--heat-5)] text-white dark:text-[#04201d]",
  "bg-[var(--heat-6)] text-white dark:text-[#04201d]",
];

export function Heatmap({
  rows,
  cols,
  cells,
  thresholds,
  formatThreshold,
  caption,
  rowHeader,
}: {
  rows: string[];
  cols: { key: string; label: string }[];
  cells: HeatCell[];
  /** Five ascending cut points defining six bins. */
  thresholds: [number, number, number, number, number];
  formatThreshold: (v: number) => string;
  caption: string;
  rowHeader: string;
}) {
  const bin = (v: number) => thresholds.filter((t) => v >= t).length;
  const lookup = new Map(cells.map((c) => [`${c.row}|${c.col}`, c]));
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-separate border-spacing-[2px] text-xs">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              <th scope="col" className="w-28 px-2 py-1 text-left font-medium text-muted-foreground">
                {rowHeader}
              </th>
              {cols.map((c) => (
                <th key={c.key} scope="col" className="px-1 py-1 text-center font-medium whitespace-nowrap text-muted-foreground">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r}>
                <th scope="row" className="px-2 py-1 text-left font-normal whitespace-nowrap text-muted-foreground">
                  {r}
                </th>
                {cols.map((c) => {
                  const cell = lookup.get(`${r}|${c.key}`);
                  if (!cell || cell.value === null) {
                    return (
                      <td key={c.key} className="h-9 rounded-[4px] bg-[var(--heat-0)] text-center text-muted-foreground">
                        <span aria-label="Not enough data">–</span>
                      </td>
                    );
                  }
                  return (
                    <td key={c.key} className="p-0">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className={cn(
                              "num h-9 w-full rounded-[4px] text-center font-medium outline-none transition-shadow duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                              STEPS[bin(cell.value)],
                            )}
                            aria-label={`${r}, ${c.label}: ${cell.label}`}
                          >
                            {cell.label}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="border-0 bg-transparent p-0 shadow-none [&>svg]:hidden" side="top">
                          <TipCard model={cell.tooltip} />
                        </TooltipContent>
                      </Tooltip>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1" aria-hidden>
          {STEPS.map((s, i) => (
            <span key={i} className={cn("h-3 w-7 rounded-[2px]", s.split(" ")[0])} />
          ))}
        </span>
        <span className="num">
          {formatThreshold(0)} → {formatThreshold(thresholds[4])}+ (cut points {thresholds.map(formatThreshold).join(", ")})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-7 rounded-[2px] bg-[var(--heat-0)]" aria-hidden /> Fewer than 8 staff on average
        </span>
      </div>
    </div>
  );
}
