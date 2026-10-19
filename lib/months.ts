import { addMonths, differenceInCalendarDays, endOfMonth, format, parseISO } from "date-fns";

/** Month keys are yyyy-MM strings, so they sort and compare lexicographically. */
export type MonthKey = string;

export function toMonthDate(month: MonthKey): Date {
  return parseISO(`${month}-01`);
}

export function shiftMonth(month: MonthKey, by: number): MonthKey {
  return format(addMonths(toMonthDate(month), by), "yyyy-MM");
}

/** Inclusive list of months from `from` to `to`. Empty when from > to. */
export function monthRange(from: MonthKey, to: MonthKey): MonthKey[] {
  const out: MonthKey[] = [];
  for (let m = from; m <= to; m = shiftMonth(m, 1)) out.push(m);
  return out;
}

export function monthCount(from: MonthKey, to: MonthKey): number {
  return monthRange(from, to).length;
}

/** Last calendar day of a month as yyyy-MM-dd. */
export function monthEndDate(month: MonthKey): string {
  return format(endOfMonth(toMonthDate(month)), "yyyy-MM-dd");
}

export function monthOf(date: string): MonthKey {
  return date.slice(0, 7);
}

export function daysBetween(from: string, to: string): number {
  return differenceInCalendarDays(parseISO(to), parseISO(from));
}

export function addDaysIso(date: string, days: number): string {
  const d = parseISO(date);
  d.setDate(d.getDate() + days);
  return format(d, "yyyy-MM-dd");
}

/** "2026-Q3" for a month key. */
export function quarterOf(month: MonthKey): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
}

export function formatMonth(month: MonthKey, pattern = "MMM yy"): string {
  return format(toMonthDate(month), pattern);
}

export function formatQuarter(quarter: string): string {
  const [y, q] = quarter.split("-");
  return `${q} ${y?.slice(2)}`;
}

export function formatDate(date: string, pattern = "d MMM yyyy"): string {
  return format(parseISO(date), pattern);
}
