"use client";

import { useMemo } from "react";
import { useFilters } from "@/hooks/use-filters";
import { periodEndDate, periodMonths, previousPeriod, type Period, type Scope } from "@/lib/metrics";
import { formatMonth } from "@/lib/months";
import { AS_OF, FIRST_MONTH, siteShort } from "@/lib/org";

/** Everything a report needs to know about the current filter state. */
export function useReport() {
  const { filters, resetFilters, setParam, searchParams } = useFilters();
  return useMemo(() => {
    const period: Period = { from: filters.from, to: filters.to };
    const scope: Scope = { siteId: filters.siteId, department: filters.department };
    const months = periodMonths(period);
    const prev = previousPeriod(period, FIRST_MONTH);
    const end = periodEndDate(period, AS_OF);
    const prevEnd = prev ? periodEndDate(prev, AS_OF) : null;
    const scopeLabel = [filters.siteId ? siteShort(filters.siteId) : "All sites", filters.department ?? "All departments"].join(" · ");
    const periodLabel = `${formatMonth(period.from, "MMM yyyy")} – ${formatMonth(period.to, "MMM yyyy")}`;
    return {
      filters,
      period,
      scope,
      months,
      prev,
      prevMonths: prev ? periodMonths(prev) : [],
      end,
      prevEnd,
      comparison: `vs prior ${months.length} mo`,
      scopeLabel,
      periodLabel,
      resetFilters,
      setParam,
      searchParams,
    };
  }, [filters, resetFilters, setParam, searchParams]);
}

export type Report = ReturnType<typeof useReport>;
