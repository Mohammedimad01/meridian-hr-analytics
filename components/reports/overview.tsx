"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ChartFrame, Legend, LegendItem } from "@/components/charts/chart-frame";
import { ColumnChart } from "@/components/charts/column-chart";
import { RankedBars } from "@/components/charts/ranked-bars";
import { monthLabel, TrendChart } from "@/components/charts/trend-chart";
import { EmptyState } from "@/components/dashboard/empty-state";
import { KpiCard, KpiRow, type KpiProps } from "@/components/dashboard/kpi-card";
import { Panel } from "@/components/dashboard/panel";
import { StatusBadge, type StatusTone } from "@/components/dashboard/status-badge";
import { withQuery } from "@/hooks/use-filters";
import { useDataset } from "@/lib/data";
import { writeFilters } from "@/lib/filters";
import { formatDays, formatDelta, formatNumber, formatPercent, formatSigned } from "@/lib/format";
import {
  attritionBy,
  atRiskCount,
  averageTimeToHire,
  bucketCounts,
  change,
  daysOpen,
  hiresInPeriod,
  inScope,
  iloeSummary,
  monthlyAttritionRate,
  monthlyTotals,
  onboardingCompletion,
  rollingAttrition,
  summarizeAttrition,
  summarizePulse,
  surveyQuartersInPeriod,
  taskStatus,
} from "@/lib/metrics";
import { monthEndDate, monthRange, formatQuarter } from "@/lib/months";
import { AS_OF, FIRST_MONTH } from "@/lib/org";
import { ScopeLine } from "./scope-line";
import { useReport } from "./use-report";

export function OverviewReport() {
  const report = useReport();
  const snapshots = useDataset("snapshots");
  const requisitions = useDataset("requisitions");
  const onboarding = useDataset("onboarding");
  const compliance = useDataset("compliance");
  const engagement = useDataset("engagement");
  const { period, prev, scope, months, end, prevEnd, comparison } = report;

  const model = useMemo(() => {
    const allMonths = monthRange(FIRST_MONTH, period.to);
    const allTotals = monthlyTotals(snapshots, scope, allMonths);
    const totals = allTotals.filter((t) => t.month >= period.from);
    const prevTotals = prev ? allTotals.filter((t) => t.month >= prev.from && t.month <= prev.to) : [];
    const attrition = summarizeAttrition(totals);
    const prevAttrition = prev ? summarizeAttrition(prevTotals) : null;

    const scopedReqs = requisitions.filter((r) => inScope(r, scope));
    const tth = averageTimeToHire(hiresInPeriod(scopedReqs, period, scope));
    const prevTth = prev ? averageTimeToHire(hiresInPeriod(scopedReqs, prev, scope)) : null;

    const scopedOnboarding = onboarding.filter((r) => inScope(r, scope));
    const credentials = compliance.credentials.filter((c) => inScope(c, scope));
    const pulse = engagement.pulse.filter((p) => inScope(p, scope));

    const quarters = surveyQuartersInPeriod(period);
    const allQuarters = [...new Set(engagement.pulse.map((p) => p.quarter))].sort();
    const lastQ = quarters.at(-1) ?? null;
    const prevQ = lastQ ? allQuarters[allQuarters.indexOf(lastQ) - 1] ?? null : null;
    const enpsOf = (q: string | null) => (q ? summarizePulse(pulse.filter((p) => p.quarter === q)).enps : null);

    const headcount = totals.at(-1)?.headcountEnd ?? 0;
    const startHeadcount = totals[0]?.headcountStart ?? 0;
    const onboard = onboardingCompletion(scopedOnboarding, end).rate;
    const prevOnboard = prevEnd ? onboardingCompletion(scopedOnboarding, prevEnd).rate : null;
    const atRisk = atRiskCount(credentials, end);
    const prevAtRisk = prevEnd ? atRiskCount(credentials, prevEnd) : null;
    const enpsNow = enpsOf(lastQ);
    const enpsPrev = enpsOf(prevQ);
    const ttmWindow = months.length === 12;

    const kpis: KpiProps[] = [
      {
        label: "Headcount",
        value: formatNumber(headcount),
        delta: formatDelta(headcount - startHeadcount, "count"),
        deltaValue: headcount - startHeadcount,
        higherIsBetter: true,
        comparison: "since start of period",
        definition: "Employees on payroll at the end of the period (after that month's exits). Change is against the opening headcount of the period.",
        spark: totals.map((t) => t.headcountEnd),
        sparkLabel: "Month-end headcount trend",
      },
      {
        label: ttmWindow ? "Attrition rate (TTM)" : "Attrition rate (annualised)",
        value: formatPercent(attrition.rate),
        delta: prevAttrition ? formatDelta(change(attrition.rate, prevAttrition.rate), "pp") : null,
        deltaValue: prevAttrition ? change(attrition.rate, prevAttrition.rate) : null,
        higherIsBetter: false,
        comparison,
        definition: "All exits in the period ÷ average monthly headcount, annualised (× 12 ÷ months). For a 12-month window this is the trailing-twelve-month rate.",
        spark: totals.map((t) => rollingAttrition(allTotals, t.month) ?? (monthlyAttritionRate(t) ?? 0) * 12),
        sparkLabel: "Rolling 12-month attrition trend",
      },
      {
        label: "Avg time to hire",
        value: formatDays(tth),
        delta: prevTth !== null && tth !== null ? formatDelta(tth - prevTth, "days") : null,
        deltaValue: change(tth, prevTth),
        higherIsBetter: false,
        comparison,
        definition: "Mean calendar days from the hired candidate's application to offer acceptance, for offers accepted in the period.",
        spark: months.map((m) => averageTimeToHire(hiresInPeriod(scopedReqs, { from: m, to: m }, scope))),
        sparkLabel: "Monthly average time to hire",
      },
      {
        label: "Onboarding completion",
        value: formatPercent(onboard, 0),
        delta: prevOnboard !== null && onboard !== null ? formatDelta(onboard - prevOnboard, "pp") : null,
        deltaValue: change(onboard, prevOnboard),
        higherIsBetter: true,
        comparison: prev ? comparison : "",
        definition: "Checklist items completed ÷ items required, for joiners who started in the 90 days to the period end.",
        spark: months.map((m) => onboardingCompletion(scopedOnboarding, monthEndDate(m) < AS_OF ? monthEndDate(m) : AS_OF).rate),
        sparkLabel: "Onboarding completion at each month end",
      },
      {
        label: "Compliance items at risk",
        value: formatNumber(atRisk),
        delta: prevAtRisk !== null ? formatDelta(atRisk - prevAtRisk, "count") : null,
        deltaValue: prevAtRisk !== null ? atRisk - prevAtRisk : null,
        higherIsBetter: false,
        comparison,
        definition: "Medical licences and malpractice policies for current clinical staff that are expired or expire within 30 days with no renewal on file, as at the period end.",
        spark: months.map((m) => atRiskCount(credentials, monthEndDate(m) < AS_OF ? monthEndDate(m) : AS_OF)),
        sparkLabel: "Items at risk at each month end",
      },
      {
        label: lastQ ? `eNPS (${formatQuarter(lastQ)})` : "eNPS",
        value: formatSigned(enpsNow),
        delta: enpsNow !== null && enpsPrev !== null ? formatDelta(enpsNow - enpsPrev, "points") : null,
        deltaValue: change(enpsNow, enpsPrev),
        higherIsBetter: true,
        comparison: "vs previous survey",
        definition: "Employee Net Promoter Score from the quarterly pulse: % promoters (9–10) minus % detractors (0–6). Range −100 to +100.",
        spark: (quarters.length >= 2 ? quarters : allQuarters.slice(0, allQuarters.indexOf(lastQ ?? "") + 1).slice(-4)).map(enpsOf),
        sparkLabel: "eNPS by survey quarter",
      },
    ];

    const byDept = attritionBy(snapshots, "department", scope, months)
      .map((g) => ({ key: g.key, label: g.key, value: (g.rate ?? 0) * 100, exits: g.exits, avg: g.avgHeadcount }))
      .sort((a, b) => b.value - a.value);
    const maxRate = byDept[0]?.value ?? 0;
    const byDeptHighlighted = byDept.map((d) => ({ ...d, highlight: d.value === maxRate && byDept.length > 1 }));

    // Attention list
    const buckets = bucketCounts(credentials, end);
    const overdueTasks = scopedOnboarding.reduce(
      (n, r) => n + r.tasks.filter((t) => r.startDate <= end && taskStatus(t, end) === "Overdue").length,
      0,
    );
    const agedReqs = scopedReqs.filter((r) => (r.status === "Open" || r.status === "On hold") && daysOpen(r, AS_OF) > 45).length;
    const iloe = iloeSummary(compliance.iloe.filter((r) => inScope(r, scope)));

    return {
      kpis,
      totals,
      attrition,
      prevAttrition,
      byDept: byDeptHighlighted,
      buckets,
      overdueTasks,
      agedReqs,
      iloe,
      noData: totals.every((t) => t.headcountEnd === 0 && t.headcountStart === 0),
    };
  }, [snapshots, requisitions, onboarding, compliance, engagement, period, prev, scope, months, end, prevEnd, comparison]);


  if (model.noData) {
    return (
      <>
        <ScopeLine report={report} />
        <div className="rounded-lg border bg-card">
          <EmptyState />
        </div>
      </>
    );
  }

  const query = writeFilters(report.filters).toString();
  const attention: { label: string; count: number; tone: StatusTone; badge: string; href: string }[] = [
    { label: "Licences & malpractice policies expired", count: model.buckets["Overdue"], tone: "danger", badge: "Overdue", href: "/onboarding/" },
    { label: "Licences & policies expiring within 30 days", count: model.buckets["Due ≤ 30 days"], tone: "warning", badge: "Due soon", href: "/onboarding/" },
    { label: "Onboarding checklist items past due", count: model.overdueTasks, tone: "danger", badge: "Overdue", href: "/onboarding/" },
    { label: "Staff without ILOE registration", count: model.iloe["Not registered"], tone: "danger", badge: "Action", href: "/onboarding/" },
    { label: "Requisitions open more than 45 days", count: model.agedReqs, tone: "warning", badge: "Ageing", href: "/recruitment/" },
  ];

  const lastMonth = model.totals.at(-1)!;

  return (
    <>
      <ScopeLine report={report} />
      <KpiRow>
        {model.kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </KpiRow>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Headcount trend"
          description="Employees on payroll at each month end."
        >
          <ChartFrame
            yLabel="Employees"
            xLabel="Month end"
            summary={`Headcount moved from ${formatNumber(model.totals[0]?.headcountStart)} to ${formatNumber(lastMonth.headcountEnd)} over the period.`}
          >
            <TrendChart
              title="Headcount"
              data={model.totals.map((t) => ({
                label: monthLabel(t.month),
                value: t.headcountEnd,
                tooltipRows: [
                  { label: "Headcount", value: formatNumber(t.headcountEnd), color: "var(--chart-1)" },
                  { label: "Hires", value: formatNumber(t.hires) },
                  { label: "Exits", value: formatNumber(t.exits) },
                ],
              }))}
              format={formatNumber}
              variant="line"
              domain={[(min: number) => Math.floor((min * 0.94) / 20) * 20, (max: number) => Math.ceil((max * 1.02) / 20) * 20]}
              height={256}
            />
          </ChartFrame>
        </Panel>

        <Panel
          title="Attrition by department"
          description={`Annualised, ${report.periodLabel}. Dashed line is the ${report.filters.department ? "department" : "group"} rate.`}
        >
          {model.byDept.length === 0 ? (
            <EmptyState />
          ) : (
            <ChartFrame
              xLabel="Annualised attrition rate (%)"
              summary={`Highest attrition: ${model.byDept[0]?.label} at ${model.byDept[0]?.value.toFixed(1)}%.`}
            >
              <RankedBars
                data={model.byDept}
                format={(v) => `${v.toFixed(1)}%`}
                axisFormat={(v) => `${Math.round(v)}%`}
                reference={model.attrition.rate !== null ? { value: model.attrition.rate * 100, label: `${(model.attrition.rate * 100).toFixed(1)}%` } : undefined}
                tooltip={(d) => ({
                  title: d.label,
                  rows: [
                    { label: "Attrition (annualised)", value: `${d.value.toFixed(1)}%` },
                    { label: "Exits", value: formatNumber(d.exits) },
                    { label: "Avg headcount", value: formatNumber(d.avg) },
                  ],
                })}
              />
            </ChartFrame>
          )}
        </Panel>

        <Panel
          className="lg:col-span-2"
          title="Hires vs exits"
          description="Joiners and leavers per month. Exits include voluntary and involuntary."
        >
          <ChartFrame
            yLabel="Employees per month"
            xLabel="Month"
            legend={
              <Legend>
                <LegendItem color="var(--chart-1)" label="Hires" />
                <LegendItem color="var(--chart-2)" label="Exits" />
              </Legend>
            }
            summary={`${formatNumber(model.totals.reduce((a, t) => a + t.hires, 0))} hires and ${formatNumber(model.attrition.exits)} exits in the period.`}
          >
            <ColumnChart
              data={model.totals.map((t) => ({ label: monthLabel(t.month), hires: t.hires, exits: t.exits, net: t.hires - t.exits }))}
              series={[
                { key: "hires", label: "Hires", color: "var(--chart-1)" },
                { key: "exits", label: "Exits", color: "var(--chart-2)" },
              ]}
              format={formatNumber}
              tooltip={(d) => ({
                title: d.label,
                rows: [
                  { label: "Hires", value: formatNumber(d.hires), color: "var(--chart-1)" },
                  { label: "Exits", value: formatNumber(d.exits), color: "var(--chart-2)" },
                  { label: "Net change", value: formatSigned(d.net) },
                ],
              })}
              height={232}
            />
          </ChartFrame>
        </Panel>

        <Panel title="Needs attention" description="Open items as at the period end." bodyClassName="p-0">
          <ul className="divide-y">
            {attention.map((a) => (
              <li key={a.label}>
                <Link
                  href={withQuery(a.href, query)}
                  className="flex items-center gap-3 px-4 py-3 text-sm outline-none transition-colors duration-150 hover:bg-accent focus-visible:bg-accent"
                >
                  <span className="num w-9 shrink-0 text-right text-lg font-semibold">{formatNumber(a.count)}</span>
                  <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                    <span className="leading-snug text-muted-foreground">{a.label}</span>
                    {a.count > 0 ? (
                      <StatusBadge tone={a.tone}>{a.badge}</StatusBadge>
                    ) : (
                      <StatusBadge tone="success">Clear</StatusBadge>
                    )}
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
