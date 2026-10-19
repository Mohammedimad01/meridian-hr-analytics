"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ChartFrame, Legend, LegendItem } from "@/components/charts/chart-frame";
import { RankedBars } from "@/components/charts/ranked-bars";
import { monthLabel, TrendChart } from "@/components/charts/trend-chart";
import { DataTable } from "@/components/data-table/data-table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { KpiCard, KpiRow, type KpiProps } from "@/components/dashboard/kpi-card";
import { Panel } from "@/components/dashboard/panel";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { useDataset } from "@/lib/data";
import { formatDelta, formatNumber, formatPercent, formatScore, formatSigned } from "@/lib/format";
import { change, checkInCoverage, inScope, mean, summarizePulse, surveyQuartersInPeriod } from "@/lib/metrics";
import { formatMonth, formatQuarter } from "@/lib/months";
import { siteShort, SITES } from "@/lib/org";
import { DEPARTMENTS } from "@/lib/types";
import { ScopeLine } from "./scope-line";
import { useReport } from "./use-report";

const COVERAGE_TARGET = 0.8;

interface ManagerRow {
  managerId: string;
  managerName: string;
  siteId: string;
  department: string;
  reports: number;
  coverage: number | null;
  checkIns: number;
}

export function EngagementReport() {
  const report = useReport();
  const engagement = useDataset("engagement");
  const { period, scope, months } = report;

  const model = useMemo(() => {
    const pulse = engagement.pulse.filter((p) => inScope(p, scope));
    const allQuarters = [...new Set(engagement.pulse.map((p) => p.quarter))].sort();
    let quarters = surveyQuartersInPeriod(period);
    if (quarters.length === 0) quarters = allQuarters.filter((q) => q <= `${period.to.slice(0, 4)}-Q4`).slice(-1);
    const lastQ = quarters.at(-1) ?? null;
    const prevQ = lastQ ? allQuarters[allQuarters.indexOf(lastQ) - 1] ?? null : null;
    const ofQ = (q: string | null) => summarizePulse(q ? pulse.filter((p) => p.quarter === q) : []);
    const now = ofQ(lastQ);
    const before = ofQ(prevQ);

    // Site scores in the latest quarter; site filter is ignored here so the outlier stays visible.
    const siteScope = { ...scope, siteId: null };
    const bySite = SITES.map((s) => {
      const rows = engagement.pulse.filter((p) => p.siteId === s.id && p.quarter === lastQ && inScope(p, siteScope));
      const sum = summarizePulse(rows);
      return { key: s.id, label: s.short, value: sum.score ?? 0, responses: sum.responses, enps: sum.enps, rate: sum.responseRate };
    }).filter((s) => s.responses > 0);
    const siteMean = mean(bySite.map((s) => s.value)) ?? 0;
    const sd = Math.sqrt(mean(bySite.map((s) => (s.value - siteMean) ** 2)) ?? 0);
    const sortedSites = [...bySite].sort((a, b) => b.value - a.value);
    const lowest = sortedSites.at(-1);
    const outlier = lowest && sd > 0 && (siteMean - lowest.value) / sd > 1.5 ? lowest : null;

    const trend = quarters.map((q) => {
      const s = ofQ(q);
      const low = outlier && !scope.siteId ? summarizePulse(engagement.pulse.filter((p) => p.quarter === q && p.siteId === outlier.key && inScope(p, siteScope))) : null;
      return { label: formatQuarter(q), value: s.score, compare: low?.score ?? null, enps: s.enps, responseRate: s.responseRate };
    });

    const byDept = DEPARTMENTS.map((d) => {
      const s = summarizePulse(pulse.filter((p) => p.department === d && p.quarter === lastQ));
      return { key: d, label: d, value: s.score ?? 0, responses: s.responses, enps: s.enps };
    })
      .filter((d) => d.responses > 0)
      .sort((a, b) => b.value - a.value);

    const logs = engagement.checkIns.filter((l) => inScope(l, scope) && months.includes(l.month));
    const logMonths = months.filter((m) => logs.some((l) => l.month === m));
    const coverageTrend = logMonths.map((m) => ({ label: monthLabel(m), value: (checkInCoverage(logs.filter((l) => l.month === m)) ?? 0) * 100 }));
    const lastMonth = logMonths.at(-1) ?? null;
    const lastLogs = logs.filter((l) => l.month === lastMonth);
    const coverage = checkInCoverage(lastLogs);
    const prevMonth = logMonths.at(-2) ?? null;
    const prevCoverage = prevMonth ? checkInCoverage(logs.filter((l) => l.month === prevMonth)) : null;

    const coverageBySite = SITES.map((s) => {
      const c = checkInCoverage(lastLogs.filter((l) => l.siteId === s.id));
      return { key: s.id, label: s.short, value: (c ?? 0) * 100, has: c !== null };
    })
      .filter((s) => s.has)
      .sort((a, b) => a.value - b.value);

    // Manager table: aggregate over the period's logged months.
    const byManager = new Map<string, ManagerRow & { covered: number; total: number }>();
    for (const l of logs) {
      const key = `${l.managerId}|${l.siteId}`;
      const row = byManager.get(key) ?? {
        managerId: l.managerId,
        managerName: l.managerName,
        siteId: l.siteId,
        department: l.department,
        reports: 0,
        coverage: null,
        checkIns: 0,
        covered: 0,
        total: 0,
      };
      row.covered += l.reportsWithCheckIn;
      row.total += l.reports;
      row.checkIns += l.checkIns;
      if (l.month === lastMonth) row.reports = l.reports;
      byManager.set(key, row);
    }
    const managers: ManagerRow[] = [...byManager.values()].map((r) => ({ ...r, coverage: r.total ? r.covered / r.total : null }));

    const kpis: KpiProps[] = [
      {
        label: lastQ ? `Pulse score (${formatQuarter(lastQ)})` : "Pulse score",
        value: formatScore(now.score),
        delta: now.score !== null && before.score !== null ? formatDelta(now.score - before.score, "points") : null,
        deltaValue: change(now.score, before.score),
        higherIsBetter: true,
        comparison: "vs previous survey",
        definition: "Mean engagement index (0–100) across the quarterly pulse survey, weighted by responses.",
        spark: trend.map((t) => t.value),
        sparkLabel: "Pulse score by quarter",
      },
      {
        label: "eNPS",
        value: formatSigned(now.enps),
        delta: now.enps !== null && before.enps !== null ? formatDelta(now.enps - before.enps, "points") : null,
        deltaValue: change(now.enps, before.enps),
        higherIsBetter: true,
        comparison: "vs previous survey",
        definition: "% promoters (9–10) minus % detractors (0–6) on 'How likely are you to recommend Meridian as a place to work?'",
        spark: trend.map((t) => t.enps),
        sparkLabel: "eNPS by quarter",
      },
      {
        label: "Survey response rate",
        value: formatPercent(now.responseRate, 0),
        delta: now.responseRate !== null && before.responseRate !== null ? formatDelta(now.responseRate - before.responseRate, "pp") : null,
        deltaValue: change(now.responseRate, before.responseRate),
        higherIsBetter: true,
        comparison: "vs previous survey",
        definition: "Responses ÷ employees invited to the quarterly pulse.",
        spark: trend.map((t) => t.responseRate),
        sparkLabel: "Response rate by quarter",
      },
      {
        label: lastMonth ? `1-on-1 coverage (${formatMonth(lastMonth)})` : "1-on-1 coverage",
        value: formatPercent(coverage, 0),
        delta: coverage !== null && prevCoverage !== null ? formatDelta(coverage - prevCoverage, "pp") : null,
        deltaValue: change(coverage, prevCoverage),
        higherIsBetter: true,
        comparison: "vs previous month",
        definition: `Direct reports with at least one logged 1-on-1 in the month ÷ all direct reports. Target ${COVERAGE_TARGET * 100}%.`,
        spark: coverageTrend.map((t) => t.value),
        sparkLabel: "Monthly 1-on-1 coverage",
      },
    ];

    return { kpis, lastQ, trend, bySite: sortedSites, siteMean, outlier, byDept, coverageTrend, coverageBySite, managers, lastMonth, hasPulse: now.responses > 0 };
  }, [engagement, scope, period, months]);

  if (!model.hasPulse) {
    return (
      <>
        <ScopeLine report={report} />
        <div className="rounded-lg border bg-card">
          <EmptyState title="No survey responses in this selection" />
        </div>
      </>
    );
  }

  return (
    <>
      <ScopeLine report={report} note={model.lastQ ? `Latest survey ${formatQuarter(model.lastQ)}` : undefined} />
      <KpiRow className="xl:grid-cols-4">
        {model.kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </KpiRow>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Pulse score trend"
          description={
            model.outlier && !report.filters.siteId
              ? `Quarterly engagement index. Dashed line is ${model.outlier.label}, the lowest-scoring site.`
              : "Quarterly engagement index."
          }
        >
          <ChartFrame
            yLabel="Engagement index (0–100)"
            xLabel="Survey quarter"
            legend={
              model.outlier && !report.filters.siteId ? (
                <Legend>
                  <LegendItem color="var(--chart-1)" label={report.scopeLabel} shape="line" />
                  <LegendItem color="var(--chart-3)" label={model.outlier.label} shape="dashed" />
                </Legend>
              ) : undefined
            }
            summary={`Engagement index by quarter for ${report.scopeLabel}.`}
          >
            <TrendChart
              title={report.scopeLabel}
              variant="line"
              data={model.trend}
              compareLabel={model.outlier && !report.filters.siteId ? model.outlier.label : undefined}
              format={(v) => v.toFixed(1)}
              axisFormat={(v) => `${Math.round(v)}`}
              domain={[40, 90]}
              height={256}
            />
          </ChartFrame>
        </Panel>

        <Panel
          title="Score by site"
          description={`${model.lastQ ? formatQuarter(model.lastQ) : ""} engagement index. ${model.outlier ? `${model.outlier.label} sits more than 1.5 standard deviations below the site average.` : "Dashed line is the site average."}`}
        >
          <ChartFrame xLabel="Engagement index (0–100)" summary={`Lowest: ${model.bySite.at(-1)?.label} at ${model.bySite.at(-1)?.value.toFixed(1)}.`}>
            <RankedBars
              data={model.bySite.map((s) => ({ ...s, highlight: model.outlier?.key === s.key }))}
              format={(v) => v.toFixed(1)}
              axisFormat={(v) => `${Math.round(v)}`}
              labelWidth={112}
              rowHeight={26}
              domainMax={100}
              reference={{ value: model.siteMean, label: `Avg ${model.siteMean.toFixed(1)}` }}
              tooltip={(d) => ({
                title: d.label,
                rows: [
                  { label: "Engagement index", value: d.value.toFixed(1) },
                  { label: "eNPS", value: formatSigned(d.enps) },
                  { label: "Responses", value: formatNumber(d.responses) },
                  { label: "Response rate", value: formatPercent(d.rate, 0) },
                ],
              })}
            />
          </ChartFrame>
        </Panel>

        <Panel title="1-on-1 coverage" description={`Share of direct reports with a logged 1-on-1 each month. Dashed line is the ${COVERAGE_TARGET * 100}% target.`}>
          {model.coverageTrend.length === 0 ? (
            <EmptyState title="No check-in logs in this window" description="1-on-1 logs are held for October 2025 to September 2026. Move the date range into that window." showReset={false} />
          ) : (
            <ChartFrame yLabel="Coverage (% of reports)" xLabel="Month" summary="Monthly 1-on-1 coverage.">
              <TrendChart
                title="Coverage"
                variant="line"
                data={model.coverageTrend}
                format={(v) => `${Math.round(v)}%`}
                domain={[0, 100]}
                reference={{ value: COVERAGE_TARGET * 100, label: "Target" }}
                height={220}
              />
            </ChartFrame>
          )}
        </Panel>

        <Panel title="Coverage by site" description={model.lastMonth ? `${formatMonth(model.lastMonth, "MMMM yyyy")}, lowest first.` : "Latest month."}>
          {model.coverageBySite.length === 0 ? (
            <EmptyState showReset={false} title="No check-in logs" />
          ) : (
            <ChartFrame xLabel="Coverage (% of reports)" summary={`Lowest coverage: ${model.coverageBySite[0]?.label}.`}>
              <RankedBars
                data={model.coverageBySite.map((s) => ({ ...s, highlight: s.value < COVERAGE_TARGET * 100 }))}
                format={(v) => `${Math.round(v)}%`}
                axisFormat={(v) => `${Math.round(v)}%`}
                labelWidth={112}
                rowHeight={26}
                domainMax={100}
                reference={{ value: COVERAGE_TARGET * 100, label: "Target" }}
                tooltip={(d) => ({ title: d.label, rows: [{ label: "Coverage", value: `${d.value.toFixed(0)}%` }] })}
              />
            </ChartFrame>
          )}
        </Panel>

        <Panel title="Score by department" description={`${model.lastQ ? formatQuarter(model.lastQ) : ""} engagement index.`}>
          <ChartFrame xLabel="Engagement index (0–100)" summary={`Lowest department: ${model.byDept.at(-1)?.label}.`}>
            <RankedBars
              data={model.byDept.map((d, i, arr) => ({ ...d, highlight: i === arr.length - 1 && arr.length > 1 }))}
              format={(v) => v.toFixed(1)}
              axisFormat={(v) => `${Math.round(v)}`}
              domainMax={100}
              rowHeight={26}
              tooltip={(d) => ({
                title: d.label,
                rows: [
                  { label: "Engagement index", value: d.value.toFixed(1) },
                  { label: "eNPS", value: formatSigned(d.enps) },
                  { label: "Responses", value: formatNumber(d.responses) },
                ],
              })}
            />
          </ChartFrame>
        </Panel>
      </div>

      <Panel
        className="mt-4"
        title="1-on-1 check-ins by manager"
        description={`Coverage across all logged months in the period. Managers below the ${COVERAGE_TARGET * 100}% target are flagged.`}
      >
        <DataTable
          data={model.managers}
          columns={managerColumns}
          caption="1-on-1 check-in coverage by manager"
          searchText={(m) => `${m.managerName} ${siteShort(m.siteId)} ${m.department}`}
          searchPlaceholder="Search manager, site…"
          initialSorting={[{ id: "coverage", desc: false }]}
          getRowId={(m) => `${m.managerId}-${m.siteId}`}
          exportName="meridian-one-on-one-coverage"
          pageSize={10}
          emptyMessage="No check-in logs for this selection."
          minWidth={760}
        />
      </Panel>
    </>
  );
}

const managerColumns: ColumnDef<ManagerRow, unknown>[] = [
  { id: "manager", accessorFn: (m) => m.managerName, header: "Manager", enableHiding: false, meta: { label: "Manager", csv: (m) => m.managerName }, cell: ({ row }) => <span className="font-medium text-foreground">{row.original.managerName}</span> },
  { id: "site", accessorFn: (m) => siteShort(m.siteId), header: "Team site", meta: { label: "Team site", csv: (m) => siteShort(m.siteId) } },
  { id: "department", accessorFn: (m) => m.department, header: "Department", meta: { label: "Department", csv: (m) => m.department } },
  { id: "reports", accessorFn: (m) => m.reports, header: "Direct reports", meta: { label: "Direct reports", csv: (m) => m.reports, align: "right" } },
  { id: "checkIns", accessorFn: (m) => m.checkIns, header: "1-on-1s logged", meta: { label: "1-on-1s logged", csv: (m) => m.checkIns, align: "right" } },
  {
    id: "coverage",
    accessorFn: (m) => m.coverage ?? -1,
    header: "Coverage",
    meta: { label: "Coverage", csv: (m) => (m.coverage === null ? "" : Math.round(m.coverage * 100)) },
    cell: ({ row }) => {
      const c = row.original.coverage;
      return (
        <span className="num inline-flex items-center gap-2">
          <span className="w-9 text-right">{formatPercent(c, 0)}</span>
          {c !== null && c < 0.6 ? (
            <StatusBadge tone="danger">Well below target</StatusBadge>
          ) : c !== null && c < COVERAGE_TARGET ? (
            <StatusBadge tone="warning">Below target</StatusBadge>
          ) : (
            <StatusBadge tone="success">On target</StatusBadge>
          )}
        </span>
      );
    },
  },
];
