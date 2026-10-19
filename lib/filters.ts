import { DEPARTMENTS, type Department } from "./types";
import { FIRST_MONTH, LAST_MONTH, SITES } from "./org";
import { monthCount, shiftMonth, type MonthKey } from "./months";
import type { Period, Scope } from "./metrics";

export interface Filters extends Period, Scope {}

export const DEFAULT_FILTERS: Filters = {
  from: shiftMonth(LAST_MONTH, -11),
  to: LAST_MONTH,
  siteId: null,
  department: null,
};

export const DATE_PRESETS: { id: string; label: string; from: MonthKey; to: MonthKey }[] = [
  { id: "3m", label: "Last 3 months", from: shiftMonth(LAST_MONTH, -2), to: LAST_MONTH },
  { id: "6m", label: "Last 6 months", from: shiftMonth(LAST_MONTH, -5), to: LAST_MONTH },
  { id: "12m", label: "Last 12 months", from: shiftMonth(LAST_MONTH, -11), to: LAST_MONTH },
  { id: "24m", label: "Last 24 months", from: FIRST_MONTH, to: LAST_MONTH },
  { id: "ytd", label: "Year to date", from: `${LAST_MONTH.slice(0, 4)}-01`, to: LAST_MONTH },
  { id: "2025", label: "Calendar 2025", from: "2025-01", to: "2025-12" },
];

export function slugify(value: string): string {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const DEPT_BY_SLUG = new Map<string, Department>(DEPARTMENTS.map((d) => [slugify(d), d]));
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function validMonth(value: string | null): value is string {
  return !!value && MONTH_RE.test(value) && value >= FIRST_MONTH && value <= LAST_MONTH;
}

/** Parses URL search params into filters, falling back to defaults for anything invalid. */
export function parseFilters(params: URLSearchParams): Filters {
  let from = params.get("from");
  let to = params.get("to");
  if (!validMonth(from)) from = DEFAULT_FILTERS.from;
  if (!validMonth(to)) to = DEFAULT_FILTERS.to;
  if (from > to) [from, to] = [to, from];
  const site = params.get("site");
  const dept = params.get("dept");
  return {
    from,
    to,
    siteId: site && SITES.some((s) => s.id === site) ? site : null,
    department: (dept && DEPT_BY_SLUG.get(dept)) || null,
  };
}

/** Writes filters into params, omitting defaults so URLs stay short. */
export function writeFilters(filters: Filters, base?: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(base);
  const set = (key: string, value: string | null, fallback: string | null) => {
    if (value && value !== fallback) params.set(key, value);
    else params.delete(key);
  };
  set("from", filters.from, DEFAULT_FILTERS.from);
  set("to", filters.to, DEFAULT_FILTERS.to);
  set("site", filters.siteId, null);
  set("dept", filters.department ? slugify(filters.department) : null, null);
  return params;
}

export function isDefaultFilters(f: Filters): boolean {
  return (
    f.from === DEFAULT_FILTERS.from &&
    f.to === DEFAULT_FILTERS.to &&
    f.siteId === DEFAULT_FILTERS.siteId &&
    f.department === DEFAULT_FILTERS.department
  );
}

export function periodLength(f: Period): number {
  return monthCount(f.from, f.to);
}

/** "12 months" / "prior 3 months" style labels. */
export function periodLabel(f: Period): string {
  const n = periodLength(f);
  return `${n} ${n === 1 ? "month" : "months"}`;
}
