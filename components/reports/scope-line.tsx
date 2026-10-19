"use client";

import { formatMonth } from "@/lib/months";
import type { Report } from "./use-report";

export function ScopeLine({ report, note }: { report: Report; note?: string }) {
  const { prev } = report;
  return (
    <p className="num mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">{report.periodLabel}</span>
      <span aria-hidden>·</span>
      <span>{report.scopeLabel}</span>
      {prev && (
        <>
          <span aria-hidden>·</span>
          <span>
            Compared with {formatMonth(prev.from, "MMM yyyy")} – {formatMonth(prev.to, "MMM yyyy")}
          </span>
        </>
      )}
      {note && (
        <>
          <span aria-hidden>·</span>
          <span>{note}</span>
        </>
      )}
    </p>
  );
}
