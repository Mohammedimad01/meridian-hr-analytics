"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ChartFrame } from "@/components/charts/chart-frame";
import { RankedBars } from "@/components/charts/ranked-bars";
import { DataTable } from "@/components/data-table/data-table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { KpiCard, KpiRow, type KpiProps } from "@/components/dashboard/kpi-card";
import { Panel } from "@/components/dashboard/panel";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { useDataset } from "@/lib/data";
import { formatDays, formatDelta, formatNumber, formatPercent } from "@/lib/format";
import {
  averageTimeToHire,
  change,
  currentStage,
  daysOpen,
  funnelTotals,
  hiresInPeriod,
  inPeriod,
  inScope,
  offerAcceptanceRate,
  sourceEffectiveness,
  stageConversion,
} from "@/lib/metrics";
import { formatDate } from "@/lib/months";
import { AS_OF, siteShort } from "@/lib/org";
import { DEPARTMENTS, type Requisition } from "@/lib/types";
import { ScopeLine } from "./scope-line";
import { useReport } from "./use-report";

const SLA_DAYS = 60;
const AGEING_DAYS = 45;

export function RecruitmentReport() {
  const report = useReport();
  const requisitions = useDataset("requisitions");
  const { period, prev, scope, months, comparison } = report;

  const model = useMemo(() => {
    const scoped = requisitions.filter((r) => inScope(r, scope));
    const opened = scoped.filter((r) => inPeriod(r.openedAt, period));
    const hires = hiresInPeriod(scoped, period, scope);
    const prevHires = prev ? hiresInPeriod(scoped, prev, scope) : [];
    const decided = (reqs: Requisition[], p: typeof period) =>
      reqs.filter((r) => r.closedAt && inPeriod(r.closedAt, p) && r.offersMade > 0);
    const acceptance = offerAcceptanceRate(decided(scoped, period));
    const prevAcceptance = prev ? offerAcceptanceRate(decided(scoped, prev)) : null;
    const tth = averageTimeToHire(hires);
    const prevTth = prev ? averageTimeToHire(prevHires) : null;
    const open = scoped.filter((r) => r.status === "Open" || r.status === "On hold");

    const kpis: KpiProps[] = [
      {
        label: "Hires (offers accepted)",
        value: formatNumber(hires.length),
        delta: prev ? formatDelta(hires.length - prevHires.length, "count") : null,
        deltaValue: prev ? hires.length - prevHires.length : null,
        higherIsBetter: true,
        comparison,
        definition: "Requisitions where the selected candidate accepted an offer during the period.",
        spark: months.map((m) => hiresInPeriod(scoped, { from: m, to: m }, scope).length),
        sparkLabel: "Offers accepted per month",
      },
      {
        label: "Avg time to hire",
        value: formatDays(tth),
        delta: prev && tth !== null && prevTth !== null ? formatDelta(tth - prevTth, "days") : null,
        deltaValue: change(tth, prevTth),
        higherIsBetter: false,
        comparison,
        definition: "Mean calendar days from the hired candidate's application to offer acceptance.",
        spark: months.map((m) => averageTimeToHire(hiresInPeriod(scoped, { from: m, to: m }, scope))),
        sparkLabel: "Monthly average time to hire",
      },
      {
        label: "Offer acceptance rate",
        value: formatPercent(acceptance),
        delta: prev ? formatDelta(change(acceptance, prevAcceptance), "pp") : null,
        deltaValue: change(acceptance, prevAcceptance),
        higherIsBetter: true,
        comparison,
        definition: "Offers accepted ÷ offers decided (accepted or declined), for requisitions closed in the period.",
        spark: months.map((m) => offerAcceptanceRate(decided(scoped, { from: m, to: m }))),
        sparkLabel: "Monthly offer acceptance",
      },
      {
        label: "Open requisitions",
        value: formatNumber(open.length),
        delta: null,
        deltaValue: null,
        higherIsBetter: false,
        comparison: "",
        definition: `Requisitions open or on hold at ${formatDate(AS_OF)}. Ageing is measured against a ${SLA_DAYS}-day time-to-fill SLA.`,
        spark: months.map((m) => scoped.filter((r) => r.openedAt <= `${m}-31` && (!r.closedAt || r.closedAt > `${m}-31`)).length),
        sparkLabel: "Requisitions open at each month end",
      },
    ];

    const funnel = stageConversion(funnelTotals(opened));
    const sources = sourceEffectiveness(opened);
    const best = sources[0];
    const jobBoards = sources.find((s) => s.source === "Job boards");

    const tthByDept = DEPARTMENTS.map((d) => {
      const h = hires.filter((r) => r.department === d);
      return { key: d, label: d, value: averageTimeToHire(h) ?? 0, hires: h.length };
    })
      .filter((d) => d.hires > 0)
      .sort((a, b) => b.value - a.value);
    const maxTth = tthByDept[0]?.value ?? 0;

    return {
      kpis,
      opened,
      hires,
      tth,
      open: open.sort((a, b) => daysOpen(b, AS_OF) - daysOpen(a, AS_OF)),
      funnel,
      sources,
      best,
      jobBoards,
      tthByDept: tthByDept.map((d) => ({ ...d, highlight: d.value === maxTth })),
    };
  }, [requisitions, scope, period, prev, months, comparison]);

  const funnelData = model.funnel.map((s) => ({
    key: s.stage,
    label: s.stage,
    value: s.count,
    step: s.stepRate,
    overall: s.overallRate,
    highlight: true,
  }));

  return (
    <>
      <ScopeLine report={report} note="Funnel and sources use requisitions opened in the period" />
      <KpiRow className="xl:grid-cols-4">
        {model.kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </KpiRow>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Hiring funnel" description={`${formatNumber(model.opened.length)} requisitions opened in the period. Percentages are conversion from the previous stage.`}>
          {model.funnel[0]?.count ? (
            <>
              <ChartFrame xLabel="Candidates" summary={`${formatNumber(model.funnel[0].count)} applicants resulted in ${formatNumber(model.funnel[4]?.count)} hires.`}>
                <RankedBars
                  data={funnelData}
                  format={formatNumber}
                  labelWidth={92}
                  rowHeight={34}
                  tooltip={(d) => ({
                    title: d.label,
                    rows: [
                      { label: "Candidates", value: formatNumber(d.value) },
                      { label: "From previous stage", value: formatPercent(d.step) },
                      { label: "Of all applicants", value: formatPercent(d.overall, 2) },
                    ],
                  })}
                />
              </ChartFrame>
              <ol className="mt-3 grid grid-cols-4 gap-px overflow-hidden rounded-md border bg-border text-center text-xs">
                {model.funnel.slice(1).map((s, i) => (
                  <li key={s.stage} className="bg-card px-2 py-2">
                    <span className="block text-muted-foreground">
                      {model.funnel[i]?.stage} → {s.stage}
                    </span>
                    <span className="num mt-0.5 block text-sm font-medium">{formatPercent(s.stepRate)}</span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <EmptyState title="No requisitions opened in this selection" />
          )}
        </Panel>

        <Panel title="Source effectiveness" description="Applicant-to-hire conversion by source. Highlighted bar is the best-converting source.">
          {model.sources.some((s) => s.applicants > 0) ? (
            <>
              <ChartFrame
                xLabel="Applicant-to-hire conversion (%)"
                summary={
                  model.best && model.jobBoards
                    ? `${model.best.source} converts at ${formatPercent(model.best.conversion)} versus ${formatPercent(model.jobBoards.conversion)} for job boards.`
                    : "Conversion by source."
                }
              >
                <RankedBars
                  data={model.sources
                    .filter((s) => s.applicants > 0)
                    .map((s, i) => ({ key: s.source, label: s.source, value: (s.conversion ?? 0) * 100, highlight: i === 0, s }))}
                  format={(v) => `${v.toFixed(1)}%`}
                  axisFormat={(v) => `${Math.round(v)}%`}
                  labelWidth={128}
                  rowHeight={30}
                  tooltip={(d) => ({
                    title: d.label,
                    rows: [
                      { label: "Applicants", value: formatNumber(d.s.applicants) },
                      { label: "Hires", value: formatNumber(d.s.hires) },
                      { label: "Conversion", value: formatPercent(d.s.conversion) },
                      { label: "Avg time to hire", value: formatDays(d.s.avgTimeToHire) },
                    ],
                  })}
                />
              </ChartFrame>
              <div className="mt-3 overflow-x-auto rounded-md border">
                <table className="num w-full min-w-[420px] text-xs">
                  <caption className="sr-only">Source effectiveness detail</caption>
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left font-medium">Source</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Applicants</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Hires</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Share of hires</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Avg time to hire</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {model.sources.map((s) => (
                      <tr key={s.source}>
                        <th scope="row" className="px-3 py-2 text-left font-normal">{s.source}</th>
                        <td className="px-3 py-2 text-right">{formatNumber(s.applicants)}</td>
                        <td className="px-3 py-2 text-right">{formatNumber(s.hires)}</td>
                        <td className="px-3 py-2 text-right">{formatPercent(s.shareOfHires)}</td>
                        <td className="px-3 py-2 text-right">{formatDays(s.avgTimeToHire)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <EmptyState title="No applicants in this selection" />
          )}
        </Panel>

        <Panel
          className="lg:col-span-2"
          title="Time to hire by department"
          description="Mean days from application to offer acceptance for hires in the period. Dashed line is the overall average."
        >
          {model.tthByDept.length === 0 ? (
            <EmptyState title="No hires in this selection" />
          ) : (
            <ChartFrame xLabel="Days from application to offer acceptance" summary={`Slowest: ${model.tthByDept[0]?.label} at ${Math.round(model.tthByDept[0]?.value ?? 0)} days.`}>
              <RankedBars
                data={model.tthByDept}
                format={(v) => `${Math.round(v)} d`}
                axisFormat={(v) => `${Math.round(v)}`}
                reference={model.tth !== null ? { value: model.tth, label: `Avg ${Math.round(model.tth)} d` } : undefined}
                tooltip={(d) => ({
                  title: d.label,
                  rows: [
                    { label: "Avg time to hire", value: formatDays(d.value) },
                    { label: "Hires", value: formatNumber(d.hires) },
                  ],
                })}
              />
            </ChartFrame>
          )}
        </Panel>
      </div>

      <Panel
        className="mt-4"
        title="Open requisitions"
        description={`Roles open or on hold at ${formatDate(AS_OF)}, oldest first. Over ${AGEING_DAYS} days is flagged as ageing; over ${SLA_DAYS} days breaches the time-to-fill SLA.`}
      >
        <DataTable
          data={model.open}
          columns={openColumns}
          caption="Open requisitions"
          searchText={(r) => `${r.id} ${r.title} ${r.hiringManager} ${r.recruiter} ${r.department} ${siteShort(r.siteId)}`}
          searchPlaceholder="Search role, ID, manager…"
          initialSorting={[{ id: "age", desc: true }]}
          initialHidden={{ recruiter: false }}
          getRowId={(r) => r.id}
          exportName="meridian-open-requisitions"
          pageSize={10}
          emptyMessage="No open requisitions for the current site and department."
          minWidth={1000}
        />
      </Panel>
    </>
  );
}

const openColumns: ColumnDef<Requisition, unknown>[] = [
  {
    id: "id",
    accessorFn: (r) => r.id,
    header: "Requisition",
    meta: { label: "Requisition", csv: (r) => r.id, className: "font-mono text-xs" },
    enableHiding: false,
  },
  {
    id: "title",
    accessorFn: (r) => r.title,
    header: "Role",
    meta: { label: "Role", csv: (r) => r.title },
    cell: ({ row }) => (
      <span className="flex items-center gap-2">
        <span className="font-medium text-foreground">{row.original.title}</span>
        {row.original.priority === "High" && <span className="rounded border px-1 text-[10px] tracking-wide text-muted-foreground uppercase">High</span>}
      </span>
    ),
  },
  { id: "department", accessorFn: (r) => r.department, header: "Department", meta: { label: "Department", csv: (r) => r.department } },
  { id: "site", accessorFn: (r) => siteShort(r.siteId), header: "Site", meta: { label: "Site", csv: (r) => siteShort(r.siteId) } },
  {
    id: "opened",
    accessorFn: (r) => r.openedAt,
    header: "Opened",
    meta: { label: "Opened", csv: (r) => r.openedAt, className: "num" },
    cell: ({ row }) => formatDate(row.original.openedAt),
  },
  {
    id: "age",
    accessorFn: (r) => daysOpen(r, AS_OF),
    header: "Days open",
    meta: { label: "Days open", csv: (r) => daysOpen(r, AS_OF) },
    cell: ({ row }) => {
      const d = daysOpen(row.original, AS_OF);
      return (
        <span className="num inline-flex items-center gap-2">
          <span className="w-7 text-right">{d}</span>
          {d > SLA_DAYS ? (
            <StatusBadge tone="danger">Over SLA</StatusBadge>
          ) : d > AGEING_DAYS ? (
            <StatusBadge tone="warning">Ageing</StatusBadge>
          ) : null}
        </span>
      );
    },
  },
  { id: "stage", accessorFn: (r) => currentStage(r), header: "Pipeline stage", meta: { label: "Pipeline stage", csv: (r) => currentStage(r) } },
  {
    id: "applicants",
    accessorFn: (r) => funnelTotals([r])[0],
    header: "Applicants",
    meta: { label: "Applicants", csv: (r) => funnelTotals([r])[0], align: "right" },
  },
  { id: "manager", accessorFn: (r) => r.hiringManager, header: "Hiring manager", meta: { label: "Hiring manager", csv: (r) => r.hiringManager } },
  { id: "recruiter", accessorFn: (r) => r.recruiter, header: "Recruiter", meta: { label: "Recruiter", csv: (r) => r.recruiter } },
  {
    id: "status",
    accessorFn: (r) => r.status,
    header: "Status",
    meta: { label: "Status", csv: (r) => r.status },
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.status}</span>,
  },
];
