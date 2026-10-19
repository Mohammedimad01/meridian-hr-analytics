"use client";

import { useMemo } from "react";
import { ChartFrame, Legend, LegendItem } from "@/components/charts/chart-frame";
import { ColumnChart } from "@/components/charts/column-chart";
import { Heatmap } from "@/components/charts/heatmap";
import { RankedBars } from "@/components/charts/ranked-bars";
import { monthLabel, TrendChart } from "@/components/charts/trend-chart";
import { EmptyState } from "@/components/dashboard/empty-state";
import { KpiCard, KpiRow, type KpiProps } from "@/components/dashboard/kpi-card";
import { Panel } from "@/components/dashboard/panel";
import { useDataset } from "@/lib/data";
import { formatDelta, formatNumber, formatPercent } from "@/lib/format";
import {
  attritionMatrix,
  change,
  earlyExitShare,
  exitReasons,
  firstYearAttritionByCohort,
  monthlyAttritionRate,
  monthlyTotals,
  rollingAttrition,
  summarizeAttrition,
} from "@/lib/metrics";
import { formatQuarter, monthRange, shiftMonth } from "@/lib/months";
import { AS_OF, FIRST_MONTH, SITES } from "@/lib/org";
import { DEPARTMENTS } from "@/lib/types";
import { ScopeLine } from "./scope-line";
import { useReport } from "./use-report";

const MIN_HEADCOUNT = 8;

export function AttritionReport() {
  const report = useReport();
  const snapshots = useDataset("snapshots");
  const employees = useDataset("employees");
  const { period, prev, scope, months, comparison } = report;

  const model = useMemo(() => {
    const allTotals = monthlyTotals(snapshots, scope, monthRange(FIRST_MONTH, period.to));
    const totals = allTotals.filter((t) => t.month >= period.from);
    const prevTotals = prev ? allTotals.filter((t) => t.month >= prev.from && t.month <= prev.to) : [];
    const now = summarizeAttrition(totals);
    const before = prev ? summarizeAttrition(prevTotals) : null;
    const early = earlyExitShare(employees, period, scope);
    const earlyPrev = prev ? earlyExitShare(employees, prev, scope) : null;

    const kpis: KpiProps[] = [
      {
        label: "Total attrition (annualised)",
        value: formatPercent(now.rate),
        delta: before ? formatDelta(change(now.rate, before.rate), "pp") : null,
        deltaValue: before ? change(now.rate, before.rate) : null,
        higherIsBetter: false,
        comparison,
        definition: "All exits ÷ average monthly headcount, annualised to 12 months.",
        spark: totals.map((t) => rollingAttrition(allTotals, t.month) ?? (monthlyAttritionRate(t) ?? 0) * 12),
        sparkLabel: "Rolling 12-month attrition",
      },
      {
        label: "Voluntary attrition",
        value: formatPercent(now.voluntaryRate),
        delta: before ? formatDelta(change(now.voluntaryRate, before.voluntaryRate), "pp") : null,
        deltaValue: before ? change(now.voluntaryRate, before.voluntaryRate) : null,
        higherIsBetter: false,
        comparison,
        definition: "Resignations and other employee-initiated exits ÷ average headcount, annualised.",
        spark: totals.map((t) => t.exitsVoluntary),
        sparkLabel: "Voluntary exits per month",
      },
      {
        label: "Involuntary attrition",
        value: formatPercent(now.involuntaryRate),
        delta: before ? formatDelta(change(now.involuntaryRate, before.involuntaryRate), "pp") : null,
        deltaValue: before ? change(now.involuntaryRate, before.involuntaryRate) : null,
        higherIsBetter: false,
        comparison,
        definition: "Terminations, failed probations and non-renewals ÷ average headcount, annualised.",
        spark: totals.map((t) => t.exitsInvoluntary),
        sparkLabel: "Involuntary exits per month",
      },
      {
        label: "Exits in first year",
        value: formatPercent(early.share),
        delta: earlyPrev ? formatDelta(change(early.share, earlyPrev.share), "pp") : null,
        deltaValue: earlyPrev ? change(early.share, earlyPrev.share) : null,
        higherIsBetter: false,
        comparison,
        definition: "Share of the period's leavers whose tenure was under 12 months at exit.",
        spark: months.map((m) => earlyExitShare(employees, { from: m, to: m }, scope).share),
        sparkLabel: "Monthly share of exits within first year",
      },
    ];

    // Rolling 12-month rate, with the same months a year earlier for comparison.
    const rolling = totals.map((t) => ({
      label: monthLabel(t.month),
      value: rollingAttrition(allTotals, t.month),
      compare: rollingAttrition(allTotals, shiftMonth(t.month, -12)),
    }));
    const hasRolling = rolling.some((r) => r.value !== null);
    const hasCompare = rolling.some((r) => r.compare !== null);
    const monthly = totals.map((t) => ({ label: monthLabel(t.month), value: (monthlyAttritionRate(t) ?? 0) * 12, compare: null }));

    const summerBands = months
      .filter((m) => m.endsWith("-06"))
      .map((m) => ({ x1: monthLabel(m), x2: monthLabel(months.includes(shiftMonth(m, 2)) ? shiftMonth(m, 2) : months.at(-1)!), label: "Jun–Aug" }));

    const reasons = exitReasons(snapshots, scope, months).map((r) => ({
      key: r.reason,
      label: r.reason,
      value: r.count,
      share: r.share,
      highlight: r.voluntary,
    }));

    const matrix = attritionMatrix(snapshots, months, scope);
    const sitesShown = SITES.filter((s) => matrix.some((c) => c.siteId === s.id));
    const deptsShown = DEPARTMENTS.filter((d) => matrix.some((c) => c.department === d));

    const cohorts = firstYearAttritionByCohort(employees, { from: shiftMonth(period.to, -23) < FIRST_MONTH ? FIRST_MONTH : shiftMonth(period.to, -23), to: period.to }, scope, AS_OF).filter(
      (c) => c.hires > 0,
    );

    return { kpis, totals, now, rolling, hasRolling, hasCompare, monthly, summerBands, reasons, matrix, sitesShown, deptsShown, cohorts };
  }, [snapshots, employees, period, prev, scope, months, comparison]);

  if (model.totals.every((t) => t.headcountStart + t.headcountEnd === 0)) {
    return (
      <>
        <ScopeLine report={report} />
        <div className="rounded-lg border bg-card">
          <EmptyState />
        </div>
      </>
    );
  }

  const exitsTotal = model.now.exits;

  return (
    <>
      <ScopeLine report={report} />
      <KpiRow className="xl:grid-cols-4">
        {model.kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </KpiRow>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Exits per month" description="Voluntary and involuntary leavers. The shaded window marks June to August.">
          <ChartFrame
            yLabel="Exits (employees)"
            xLabel="Month of exit"
            legend={
              <Legend>
                <LegendItem color="var(--chart-1)" label="Voluntary" />
                <LegendItem color="var(--chart-2)" label="Involuntary" />
                {model.summerBands.length > 0 && <LegendItem color="color-mix(in oklab, var(--chart-muted) 60%, transparent)" label="Jun–Aug" />}
              </Legend>
            }
            summary={`${formatNumber(exitsTotal)} exits in the period: ${formatNumber(model.now.voluntary)} voluntary and ${formatNumber(model.now.involuntary)} involuntary.`}
          >
            <ColumnChart
              data={model.totals.map((t) => ({ label: monthLabel(t.month), vol: t.exitsVoluntary, invol: t.exitsInvoluntary }))}
              series={[
                { key: "vol", label: "Voluntary", color: "var(--chart-1)" },
                { key: "invol", label: "Involuntary", color: "var(--chart-2)" },
              ]}
              stacked
              showTotals
              bands={model.summerBands}
              format={formatNumber}
              height={256}
              tooltip={(d) => ({
                title: d.label,
                rows: [
                  { label: "Voluntary", value: formatNumber(d.vol), color: "var(--chart-1)" },
                  { label: "Involuntary", value: formatNumber(d.invol), color: "var(--chart-2)" },
                  { label: "Total", value: formatNumber(d.vol + d.invol) },
                ],
              })}
            />
          </ChartFrame>
        </Panel>

        <Panel
          title={model.hasRolling ? "Rolling 12-month attrition" : "Monthly attrition (annualised)"}
          description={
            model.hasRolling
              ? `Trailing-twelve-month rate at each month end${model.hasCompare ? "; dashed line is the same month a year earlier" : ""}.`
              : "Not enough history for a rolling rate in this window; showing each month's rate × 12."
          }
        >
          <ChartFrame
            yLabel="Attrition rate (%)"
            xLabel="Month end"
            legend={
              model.hasCompare ? (
                <Legend>
                  <LegendItem color="var(--chart-1)" label="Rolling 12-month" shape="line" />
                  <LegendItem color="var(--chart-3)" label="One year earlier" shape="dashed" />
                </Legend>
              ) : undefined
            }
            summary="Trend of the annualised attrition rate."
          >
            <TrendChart
              title="Attrition rate"
              variant="line"
              data={(model.hasRolling ? model.rolling : model.monthly).map((d) => ({
                ...d,
                value: d.value === null ? null : d.value * 100,
                compare: d.compare === null || d.compare === undefined ? null : d.compare * 100,
              }))}
              compareLabel={model.hasCompare ? "One year earlier" : undefined}
              format={(v) => `${v.toFixed(1)}%`}
              axisFormat={(v) => `${Math.round(v)}%`}
              domain={[0, "auto"]}
              height={256}
            />
          </ChartFrame>
        </Panel>

        <Panel title="Exit reasons" description="Primary reason recorded at exit interview or termination.">
          {model.reasons.length === 0 ? (
            <EmptyState title="No exits in this selection" description="No one left within the current filters." showReset={false} />
          ) : (
            <ChartFrame
              xLabel="Exits (employees)"
              legend={
                <Legend>
                  <LegendItem color="var(--chart-1)" label="Voluntary" />
                  <LegendItem color="var(--chart-2)" label="Involuntary" />
                </Legend>
              }
              summary={`Most common reason: ${model.reasons[0]?.label} (${model.reasons[0]?.value} exits).`}
            >
              <RankedBars
                data={model.reasons}
                format={formatNumber}
                labelWidth={164}
                rowHeight={26}
                tooltip={(d) => ({
                  title: d.label,
                  rows: [
                    { label: "Exits", value: formatNumber(d.value) },
                    { label: "Share of exits", value: formatPercent(d.share) },
                    { label: "Type", value: d.highlight ? "Voluntary" : "Involuntary" },
                  ],
                })}
              />
            </ChartFrame>
          )}
        </Panel>

        <Panel
          title="First-year attrition by hire cohort"
          description="Hires from the 24 months to the period end who left within 12 months of joining. Lighter bars are cohorts still inside their first year."
        >
          {model.cohorts.length === 0 ? (
            <EmptyState title="No hires in this selection" showReset={false} description="There were no joiners in the cohorts shown." />
          ) : (
            <ChartFrame
              yLabel="Left within 12 months (% of hires)"
              xLabel="Hire quarter"
              legend={
                <Legend>
                  <LegendItem color="var(--chart-1)" label="Full year observed" />
                  <LegendItem color="color-mix(in oklab, var(--chart-1) 45%, transparent)" label="Still in progress" />
                </Legend>
              }
              summary="First-year attrition rate for each hire quarter."
            >
              <ColumnChart
                data={model.cohorts.map((c) => ({
                  label: formatQuarter(c.quarter),
                  rate: (c.rate ?? 0) * 100,
                  hires: c.hires,
                  left: c.leftWithinYear,
                  complete: c.complete,
                }))}
                series={[{ key: "rate", label: "First-year attrition", color: "var(--chart-1)" }]}
                highlight={(d) => d.complete}
                format={(v) => `${Math.round(v)}%`}
                height={256}
                tooltip={(d) => ({
                  title: `${d.label} hires`,
                  rows: [
                    { label: "Hires", value: formatNumber(d.hires) },
                    { label: "Left within a year", value: formatNumber(d.left) },
                    { label: "First-year attrition", value: `${d.rate.toFixed(1)}%` },
                  ],
                  note: d.complete ? undefined : "Cohort has not completed 12 months yet; rate will rise.",
                })}
              />
            </ChartFrame>
          )}
        </Panel>
      </div>

      <Panel
        className="mt-4"
        title="Attrition by department and site"
        description="Annualised attrition rate for each department at each site. Darker cells mean higher attrition."
      >
        {model.matrix.length === 0 ? (
          <EmptyState />
        ) : (
          <Heatmap
            caption="Annualised attrition rate by department and site"
            rowHeader="Department"
            rows={model.deptsShown}
            cols={model.sitesShown.map((s) => ({ key: s.id, label: s.short.replace(" Hospital", " (H)") }))}
            thresholds={[0.1, 0.15, 0.2, 0.3, 0.4]}
            formatThreshold={(v) => `${Math.round(v * 100)}%`}
            cells={model.matrix.map((c) => {
              const enough = c.avgHeadcount >= MIN_HEADCOUNT;
              return {
                row: c.department,
                col: c.siteId,
                value: enough ? c.rate : null,
                label: enough && c.rate !== null ? `${Math.round(c.rate * 100)}%` : null,
                tooltip: {
                  title: `${c.department} · ${SITES.find((s) => s.id === c.siteId)?.short}`,
                  rows: [
                    { label: "Attrition (annualised)", value: formatPercent(c.rate) },
                    { label: "Exits", value: formatNumber(c.exits) },
                    { label: "Avg headcount", value: c.avgHeadcount.toFixed(1) },
                  ],
                },
              };
            })}
          />
        )}
      </Panel>
    </>
  );
}
