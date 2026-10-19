/**
 * KPI calculations. Every function here is pure: data and the reporting
 * period/scope go in, numbers come out. No React, no globals, no Date.now().
 * Formulas are documented in README.md under "KPI definitions".
 */
import {
  addDaysIso,
  daysBetween,
  monthEndDate,
  monthOf,
  monthRange,
  quarterOf,
  shiftMonth,
  type MonthKey,
} from "./months";
import {
  PIPELINE_STAGES,
  SOURCES,
  type CheckInLog,
  type Credential,
  type Department,
  type Employee,
  type IloeRecord,
  type IloeStatus,
  type MonthlySnapshot,
  type OnboardingRecord,
  type OnboardingTask,
  type PulseResult,
  type Requisition,
  type Source,
  type StageCounts,
} from "./types";

/* ------------------------------------------------------------------ */
/* Scope and period                                                    */
/* ------------------------------------------------------------------ */

export interface Scope {
  siteId: string | null;
  department: Department | null;
}

export interface Period {
  from: MonthKey;
  to: MonthKey;
}

export const ALL_SCOPE: Scope = { siteId: null, department: null };

export function inScope(row: { siteId: string; department: Department }, scope: Scope): boolean {
  return (!scope.siteId || row.siteId === scope.siteId) && (!scope.department || row.department === scope.department);
}

export function periodMonths(period: Period): MonthKey[] {
  return monthRange(period.from, period.to);
}

export function inPeriod(date: string | null | undefined, period: Period): boolean {
  if (!date) return false;
  const m = monthOf(date);
  return m >= period.from && m <= period.to;
}

/**
 * The comparison period: same length, ending the month before `from`.
 * Returns null if it would start before the first month with data.
 */
export function previousPeriod(period: Period, firstAvailable: MonthKey): Period | null {
  const length = periodMonths(period).length;
  const prev = { from: shiftMonth(period.from, -length), to: shiftMonth(period.from, -1) };
  return prev.from < firstAvailable ? null : prev;
}

/* ------------------------------------------------------------------ */
/* Small numeric helpers                                               */
/* ------------------------------------------------------------------ */

export function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

export function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Absolute change, or null when either side is missing. */
export function change(current: number | null, previous: number | null): number | null {
  return current === null || previous === null ? null : current - previous;
}

/* ------------------------------------------------------------------ */
/* Headcount and attrition                                             */
/* ------------------------------------------------------------------ */

export interface MonthTotals {
  month: MonthKey;
  headcountStart: number;
  headcountEnd: number;
  hires: number;
  exits: number;
  exitsVoluntary: number;
  exitsInvoluntary: number;
}

/** Aggregates snapshot rows into one row per month (zero-filled). */
export function monthlyTotals(snapshots: MonthlySnapshot[], scope: Scope, months: MonthKey[]): MonthTotals[] {
  const byMonth = new Map<MonthKey, MonthTotals>(
    months.map((month) => [
      month,
      { month, headcountStart: 0, headcountEnd: 0, hires: 0, exits: 0, exitsVoluntary: 0, exitsInvoluntary: 0 },
    ]),
  );
  for (const s of snapshots) {
    const row = byMonth.get(s.month);
    if (!row || !inScope(s, scope)) continue;
    row.headcountStart += s.headcountStart;
    row.headcountEnd += s.headcountEnd;
    row.hires += s.hires;
    row.exitsVoluntary += s.exitsVoluntary;
    row.exitsInvoluntary += s.exitsInvoluntary;
    row.exits += s.exitsVoluntary + s.exitsInvoluntary;
  }
  return months.map((m) => byMonth.get(m)!);
}

/** Mean of each month's (opening + closing headcount) / 2. */
export function averageHeadcount(totals: MonthTotals[]): number {
  if (totals.length === 0) return 0;
  return totals.reduce((a, t) => a + (t.headcountStart + t.headcountEnd) / 2, 0) / totals.length;
}

/**
 * Annualised attrition rate: exits / average headcount, scaled to 12 months.
 * For a 12-month window this is the trailing-twelve-month (TTM) rate.
 */
export function attritionRate(exits: number, avgHeadcount: number, months: number): number | null {
  if (avgHeadcount <= 0 || months <= 0) return null;
  return (exits / avgHeadcount) * (12 / months);
}

export interface AttritionSummary {
  exits: number;
  voluntary: number;
  involuntary: number;
  avgHeadcount: number;
  rate: number | null;
  voluntaryRate: number | null;
  involuntaryRate: number | null;
}

export function summarizeAttrition(totals: MonthTotals[]): AttritionSummary {
  const exits = totals.reduce((a, t) => a + t.exits, 0);
  const voluntary = totals.reduce((a, t) => a + t.exitsVoluntary, 0);
  const involuntary = exits - voluntary;
  const avgHeadcount = averageHeadcount(totals);
  const n = totals.length;
  return {
    exits,
    voluntary,
    involuntary,
    avgHeadcount,
    rate: attritionRate(exits, avgHeadcount, n),
    voluntaryRate: attritionRate(voluntary, avgHeadcount, n),
    involuntaryRate: attritionRate(involuntary, avgHeadcount, n),
  };
}

/** Monthly (not annualised) attrition rate: exits in month / average headcount in month. */
export function monthlyAttritionRate(t: MonthTotals): number | null {
  return ratio(t.exits, (t.headcountStart + t.headcountEnd) / 2);
}

/**
 * Rolling 12-month attrition ending at `month`. Needs a full 12 months of
 * history in `allTotals`, otherwise null.
 */
export function rollingAttrition(allTotals: MonthTotals[], month: MonthKey, window = 12): number | null {
  const start = shiftMonth(month, -(window - 1));
  const slice = allTotals.filter((t) => t.month >= start && t.month <= month);
  if (slice.length < window) return null;
  return summarizeAttrition(slice).rate;
}

export interface GroupAttrition<K extends string> {
  key: K;
  exits: number;
  voluntary: number;
  avgHeadcount: number;
  rate: number | null;
}

/** Annualised attrition per department or per site over the given months. */
export function attritionBy<K extends "department" | "siteId">(
  snapshots: MonthlySnapshot[],
  key: K,
  scope: Scope,
  months: MonthKey[],
): GroupAttrition<string>[] {
  const keys = [...new Set(snapshots.map((s) => s[key] as string))];
  return keys
    .map((k) => {
      const groupScope: Scope = key === "department" ? { ...scope, department: k as Department } : { ...scope, siteId: k };
      if ((key === "department" && scope.department && scope.department !== k) || (key === "siteId" && scope.siteId && scope.siteId !== k)) {
        return null;
      }
      const s = summarizeAttrition(monthlyTotals(snapshots, groupScope, months));
      return { key: k, exits: s.exits, voluntary: s.voluntary, avgHeadcount: s.avgHeadcount, rate: s.rate };
    })
    .filter((g): g is GroupAttrition<string> => g !== null && g.avgHeadcount > 0);
}

export interface MatrixCell {
  siteId: string;
  department: Department;
  exits: number;
  avgHeadcount: number;
  rate: number | null;
}

/** Department x site attrition matrix for the heatmap. */
export function attritionMatrix(snapshots: MonthlySnapshot[], months: MonthKey[], scope: Scope): MatrixCell[] {
  const cells = new Map<string, { siteId: string; department: Department; rows: MonthlySnapshot[] }>();
  const monthSet = new Set(months);
  for (const s of snapshots) {
    if (!monthSet.has(s.month) || !inScope(s, scope)) continue;
    const k = `${s.siteId}|${s.department}`;
    if (!cells.has(k)) cells.set(k, { siteId: s.siteId, department: s.department, rows: [] });
    cells.get(k)!.rows.push(s);
  }
  return [...cells.values()].map(({ siteId, department, rows }) => {
    const totals = monthlyTotals(rows, ALL_SCOPE, months);
    const s = summarizeAttrition(totals);
    return { siteId, department, exits: s.exits, avgHeadcount: s.avgHeadcount, rate: s.rate };
  });
}

export const INVOLUNTARY_REASONS = new Set([
  "Probation not passed",
  "Performance",
  "Contract not renewed",
  "Misconduct",
  "Restructuring",
]);

export interface ReasonCount {
  reason: string;
  count: number;
  share: number;
  voluntary: boolean;
}

export function exitReasons(snapshots: MonthlySnapshot[], scope: Scope, months: MonthKey[]): ReasonCount[] {
  const monthSet = new Set(months);
  const counts = new Map<string, number>();
  for (const s of snapshots) {
    if (!monthSet.has(s.month) || !inScope(s, scope)) continue;
    for (const [reason, n] of Object.entries(s.exitReasons)) counts.set(reason, (counts.get(reason) ?? 0) + n);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count, share: total ? count / total : 0, voluntary: !INVOLUNTARY_REASONS.has(reason) }))
    .sort((a, b) => b.count - a.count);
}

/* ------------------------------------------------------------------ */
/* Workforce                                                           */
/* ------------------------------------------------------------------ */

export function isEmployedAt(e: Pick<Employee, "hireDate" | "exitDate">, date: string): boolean {
  return e.hireDate <= date && (!e.exitDate || e.exitDate > date);
}

export function workforceAt(employees: Employee[], date: string, scope: Scope): Employee[] {
  return employees.filter((e) => inScope(e, scope) && isEmployedAt(e, date));
}

export function countBy<T>(rows: T[], key: (row: T) => string): { key: string; count: number; share: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(key(r), (counts.get(key(r)) ?? 0) + 1);
  return [...counts.entries()]
    .map(([k, count]) => ({ key: k, count, share: rows.length ? count / rows.length : 0 }))
    .sort((a, b) => b.count - a.count);
}

/** Keeps the top N categories and folds the remainder into "Other". */
export function topNWithOther(rows: { key: string; count: number; share: number }[], n: number) {
  if (rows.length <= n) return rows;
  const top = rows.slice(0, n);
  const rest = rows.slice(n);
  return [
    ...top,
    { key: "Other", count: rest.reduce((a, r) => a + r.count, 0), share: rest.reduce((a, r) => a + r.share, 0) },
  ];
}

export const TENURE_BANDS = ["< 1 yr", "1–2 yrs", "2–5 yrs", "5–10 yrs", "10+ yrs"] as const;

export function tenureBand(years: number): (typeof TENURE_BANDS)[number] {
  if (years < 1) return "< 1 yr";
  if (years < 2) return "1–2 yrs";
  if (years < 5) return "2–5 yrs";
  if (years < 10) return "5–10 yrs";
  return "10+ yrs";
}

export function tenureYearsAt(e: Pick<Employee, "hireDate">, date: string): number {
  return daysBetween(e.hireDate, date) / 365.25;
}

/* ------------------------------------------------------------------ */
/* First-year attrition                                                */
/* ------------------------------------------------------------------ */

/** Share of the period's leavers who left within 12 months of joining. */
export function earlyExitShare(employees: Employee[], period: Period, scope: Scope): { early: number; exits: number; share: number | null } {
  const leavers = employees.filter((e) => inScope(e, scope) && inPeriod(e.exitDate, period));
  const early = leavers.filter((e) => daysBetween(e.hireDate, e.exitDate!) < 365).length;
  return { early, exits: leavers.length, share: ratio(early, leavers.length) };
}

export interface CohortRetention {
  quarter: string;
  hires: number;
  leftWithinYear: number;
  rate: number | null;
  /** False when the cohort has not yet reached 12 months of tenure by asOf. */
  complete: boolean;
}

/**
 * First-year attrition by hire-quarter cohort: hires who left within 365 days
 * of their start date, divided by hires in the cohort.
 */
export function firstYearAttritionByCohort(employees: Employee[], period: Period, scope: Scope, asOf: string): CohortRetention[] {
  const cohorts = new Map<string, Employee[]>();
  for (const q of new Set(periodMonths(period).map(quarterOf))) cohorts.set(q, []);
  for (const e of employees) {
    if (!inScope(e, scope) || !inPeriod(e.hireDate, period)) continue;
    cohorts.get(quarterOf(monthOf(e.hireDate)))?.push(e);
  }
  return [...cohorts.entries()].map(([quarter, hires]) => {
    const leftWithinYear = hires.filter((e) => e.exitDate && daysBetween(e.hireDate, e.exitDate) < 365).length;
    const lastHire = hires.reduce((max, e) => (e.hireDate > max ? e.hireDate : max), "");
    return {
      quarter,
      hires: hires.length,
      leftWithinYear,
      rate: ratio(leftWithinYear, hires.length),
      complete: hires.length > 0 && addDaysIso(lastHire, 365) <= asOf,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Recruitment                                                         */
/* ------------------------------------------------------------------ */

/** Days from the hired candidate's application to offer acceptance. */
export function timeToHireDays(r: Requisition): number | null {
  return r.hire ? daysBetween(r.hire.appliedAt, r.hire.acceptedAt) : null;
}

/** Days from requisition opening to offer acceptance. */
export function timeToFillDays(r: Requisition): number | null {
  return r.hire ? daysBetween(r.openedAt, r.hire.acceptedAt) : null;
}

/** Requisitions whose offer was accepted within the period. */
export function hiresInPeriod(reqs: Requisition[], period: Period, scope: Scope): Requisition[] {
  return reqs.filter((r) => r.hire && inScope(r, scope) && inPeriod(r.hire.acceptedAt, period));
}

export function averageTimeToHire(reqs: Requisition[]): number | null {
  return mean(reqs.map(timeToHireDays).filter((d): d is number => d !== null));
}

export function offerAcceptanceRate(reqs: Requisition[]): number | null {
  const made = reqs.reduce((a, r) => a + r.offersMade, 0);
  const accepted = reqs.reduce((a, r) => a + r.offersAccepted, 0);
  return ratio(accepted, made);
}

export function funnelTotals(reqs: Requisition[], source?: Source): StageCounts {
  const out: StageCounts = [0, 0, 0, 0, 0];
  for (const r of reqs) {
    for (const [s, counts] of Object.entries(r.funnel) as [Source, StageCounts][]) {
      if (source && s !== source) continue;
      for (let i = 0; i < 5; i++) out[i] = out[i]! + counts[i]!;
    }
  }
  return out;
}

export interface StageConversion {
  stage: (typeof PIPELINE_STAGES)[number];
  count: number;
  /** Conversion from the previous stage. */
  stepRate: number | null;
  /** Share of all applicants who reached this stage. */
  overallRate: number | null;
}

export function stageConversion(counts: StageCounts): StageConversion[] {
  return PIPELINE_STAGES.map((stage, i) => ({
    stage,
    count: counts[i]!,
    stepRate: i === 0 ? null : ratio(counts[i]!, counts[i - 1]!),
    overallRate: ratio(counts[i]!, counts[0]),
  }));
}

export interface SourceStats {
  source: Source;
  applicants: number;
  interviewed: number;
  hires: number;
  /** Applicant-to-hire conversion. */
  conversion: number | null;
  avgTimeToHire: number | null;
  shareOfHires: number | null;
}

export function sourceEffectiveness(reqs: Requisition[]): SourceStats[] {
  const totalHires = reqs.filter((r) => r.hire).length;
  return SOURCES.map((source) => {
    const f = funnelTotals(reqs, source);
    const hired = reqs.filter((r) => r.hire?.source === source);
    return {
      source,
      applicants: f[0],
      interviewed: f[2],
      hires: f[4],
      conversion: ratio(f[4], f[0]),
      avgTimeToHire: averageTimeToHire(hired),
      shareOfHires: ratio(hired.length, totalHires),
    };
  }).sort((a, b) => (b.conversion ?? 0) - (a.conversion ?? 0));
}

/** Days a requisition has been (or was) open. */
export function daysOpen(r: Requisition, asOf: string): number {
  return daysBetween(r.openedAt, r.closedAt ?? asOf);
}

/** Furthest stage reached by an open requisition's pipeline. */
export function currentStage(r: Requisition): (typeof PIPELINE_STAGES)[number] {
  if (r.stages.filledAt) return "Hired";
  if (r.stages.offeredAt) return "Offered";
  if (r.stages.interviewedAt) return "Interviewed";
  if (r.stages.screenedAt) return "Screened";
  return "Applied";
}

/* ------------------------------------------------------------------ */
/* Onboarding                                                          */
/* ------------------------------------------------------------------ */

export type TaskStatus = "Done" | "Overdue" | "Due soon" | "Pending";

/** Status of a checklist item as seen on `on`. "Due soon" = due within 7 days. */
export function taskStatus(task: OnboardingTask, on: string): TaskStatus {
  if (task.completedAt && task.completedAt <= on) return "Done";
  const daysLeft = daysBetween(on, task.dueDate);
  if (daysLeft < 0) return "Overdue";
  if (daysLeft <= 7) return "Due soon";
  return "Pending";
}

export interface OnboardingSummary {
  joiners: number;
  tasks: number;
  completed: number;
  overdue: number;
  rate: number | null;
}

/**
 * Checklist completion for joiners who started in the `windowDays` up to and
 * including `on`: completed items / required items, as at `on`.
 */
export function onboardingCompletion(records: OnboardingRecord[], on: string, windowDays = 90): OnboardingSummary {
  const since = addDaysIso(on, -windowDays);
  const cohort = records.filter((r) => r.startDate > since && r.startDate <= on);
  let tasks = 0;
  let completed = 0;
  let overdue = 0;
  for (const r of cohort) {
    for (const t of r.tasks) {
      tasks++;
      const status = taskStatus(t, on);
      if (status === "Done") completed++;
      if (status === "Overdue") overdue++;
    }
  }
  return { joiners: cohort.length, tasks, completed, overdue, rate: ratio(completed, tasks) };
}

/* ------------------------------------------------------------------ */
/* Compliance                                                          */
/* ------------------------------------------------------------------ */

export const EXPIRY_BUCKETS = ["Overdue", "Due ≤ 30 days", "Due 31–60 days", "Due 61–90 days", "Valid > 90 days"] as const;
export type ExpiryBucket = (typeof EXPIRY_BUCKETS)[number];

export function expiryBucket(expiryDate: string, on: string): ExpiryBucket {
  const days = daysBetween(on, expiryDate);
  if (days < 0) return "Overdue";
  if (days <= 30) return "Due ≤ 30 days";
  if (days <= 60) return "Due 31–60 days";
  if (days <= 90) return "Due 61–90 days";
  return "Valid > 90 days";
}

/**
 * The validity end that applied on a given date, using the renewal history.
 * Null if the holder had not joined yet.
 */
export function expiryOn(c: Credential, on: string): string | null {
  if (on < c.trackedFrom || c.cycles.length === 0) return null;
  let expiry = c.cycles[0]!.to;
  for (const cycle of c.cycles) {
    if (cycle.from > on) break;
    expiry = cycle.to;
  }
  return expiry;
}

/** At risk = expired, or expiring within 30 days, without a renewal on file. */
export function isAtRisk(c: Credential, on: string): boolean {
  const expiry = expiryOn(c, on);
  if (!expiry) return false;
  const bucket = expiryBucket(expiry, on);
  return bucket === "Overdue" || bucket === "Due ≤ 30 days";
}

export function atRiskCount(credentials: Credential[], on: string): number {
  return credentials.reduce((n, c) => n + (isAtRisk(c, on) ? 1 : 0), 0);
}

export function bucketCounts(credentials: Credential[], on: string): Record<ExpiryBucket, number> {
  const out = Object.fromEntries(EXPIRY_BUCKETS.map((b) => [b, 0])) as Record<ExpiryBucket, number>;
  for (const c of credentials) {
    const expiry = expiryOn(c, on);
    if (expiry) out[expiryBucket(expiry, on)]++;
  }
  return out;
}

export function iloeSummary(records: IloeRecord[]): Record<IloeStatus, number> & { total: number; registeredRate: number | null } {
  const out = { Registered: 0, Pending: 0, "Not registered": 0 };
  for (const r of records) out[r.status]++;
  return { ...out, total: records.length, registeredRate: ratio(out.Registered, records.length) };
}

/* ------------------------------------------------------------------ */
/* Engagement                                                          */
/* ------------------------------------------------------------------ */

/** eNPS = % promoters - % detractors, on a -100..100 scale. */
export function enps(promoters: number, passives: number, detractors: number): number | null {
  const total = promoters + passives + detractors;
  if (total === 0) return null;
  return ((promoters - detractors) / total) * 100;
}

export interface PulseSummary {
  invited: number;
  responses: number;
  responseRate: number | null;
  /** Response-weighted mean score (0-100). */
  score: number | null;
  enps: number | null;
}

export function summarizePulse(rows: PulseResult[]): PulseSummary {
  let invited = 0;
  let responses = 0;
  let weighted = 0;
  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  for (const r of rows) {
    invited += r.invited;
    responses += r.responses;
    weighted += r.score * r.responses;
    promoters += r.promoters;
    passives += r.passives;
    detractors += r.detractors;
  }
  return {
    invited,
    responses,
    responseRate: ratio(responses, invited),
    score: responses ? weighted / responses : null,
    enps: enps(promoters, passives, detractors),
  };
}

export function quartersInPeriod(period: Period): string[] {
  return [...new Set(periodMonths(period).map(quarterOf))];
}

/** Quarters whose survey closed within the period (survey runs at quarter end). */
export function surveyQuartersInPeriod(period: Period): string[] {
  return periodMonths(period)
    .filter((m) => ["03", "06", "09", "12"].includes(m.slice(5)))
    .map(quarterOf);
}

export function checkInCoverage(logs: CheckInLog[]): number | null {
  const reports = logs.reduce((a, l) => a + l.reports, 0);
  const covered = logs.reduce((a, l) => a + l.reportsWithCheckIn, 0);
  return ratio(covered, reports);
}

/* ------------------------------------------------------------------ */
/* Convenience                                                         */
/* ------------------------------------------------------------------ */

/** Point-in-time measures use the end of the period's last month. */
export function periodEndDate(period: Period, asOf: string): string {
  const end = monthEndDate(period.to);
  return end < asOf ? end : asOf;
}
