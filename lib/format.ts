const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const EMPTY = "—";

/** 1214 -> "1,214" */
export function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined || Number.isNaN(value) ? EMPTY : integer.format(value);
}

/** 0.124 -> "12.4%" */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EMPTY;
  return `${(value * 100).toFixed(digits)}%`;
}

/** 38.2 -> "38 days" */
export function formatDays(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EMPTY;
  const n = Math.round(value);
  return `${integer.format(n)} ${n === 1 ? "day" : "days"}`;
}

export function formatScore(value: number | null | undefined): string {
  return value === null || value === undefined ? EMPTY : oneDecimal.format(value);
}

/** Signed eNPS, e.g. "+14" / "−6". */
export function formatSigned(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EMPTY;
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return (0).toFixed(digits);
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(digits)}`;
}

export type DeltaUnit = "count" | "pp" | "days" | "points";

/** Formats an absolute change with its unit: "+12", "−1.4 pp", "+3 days". */
export function formatDelta(value: number | null, unit: DeltaUnit): string {
  if (value === null || Number.isNaN(value)) return EMPTY;
  switch (unit) {
    case "pp":
      return `${formatSigned(value * 100, 1)} pp`;
    case "days":
      return `${formatSigned(value, 0)} ${Math.abs(Math.round(value)) === 1 ? "day" : "days"}`;
    case "points":
      return `${formatSigned(value, 0)} pts`;
    default:
      return formatSigned(value, 0);
  }
}
