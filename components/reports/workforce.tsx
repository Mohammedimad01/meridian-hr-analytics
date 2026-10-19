"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ChartFrame, Legend, LegendItem } from "@/components/charts/chart-frame";
import { ColumnChart } from "@/components/charts/column-chart";
import { RankedBars } from "@/components/charts/ranked-bars";
import { ShareBars } from "@/components/charts/share-bars";
import { DataTable } from "@/components/data-table/data-table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Panel } from "@/components/dashboard/panel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDataset } from "@/lib/data";
import { formatNumber, formatPercent } from "@/lib/format";
import {
  countBy,
  inPeriod,
  inScope,
  isEmployedAt,
  median,
  ratio,
  tenureBand,
  tenureYearsAt,
  topNWithOther,
  TENURE_BANDS,
} from "@/lib/metrics";
import { formatDate } from "@/lib/months";
import { SALARY_BAND_LABELS, siteShort, SITES } from "@/lib/org";
import { DEPARTMENTS, type Employee } from "@/lib/types";
import { EmployeeSheet } from "./employee-sheet";
import { ScopeLine } from "./scope-line";
import { useReport } from "./use-report";

type DirectoryView = "current" | "with-leavers" | "leavers";

const pct = (v: number) => `${v.toFixed(1)}%`;

export function WorkforceReport() {
  const report = useReport();
  const employees = useDataset("employees");
  const { scope, period, end, searchParams, setParam } = report;
  const [view, setView] = useState<DirectoryView>("current");

  const model = useMemo(() => {
    const current = employees.filter((e) => inScope(e, scope) && isEmployedAt(e, end));
    const n = current.length;
    const bySite = SITES.map((s) => {
      const count = current.filter((e) => e.siteId === s.id).length;
      return { key: s.id, label: s.short, value: count, share: ratio(count, n) ?? 0, highlight: true };
    })
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
    const byDept = DEPARTMENTS.map((d) => {
      const count = current.filter((e) => e.department === d).length;
      return { key: d, label: d, value: count, share: ratio(count, n) ?? 0, highlight: true };
    })
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
    const nationality = topNWithOther(countBy(current, (e) => e.nationality), 7).map((r) => ({
      key: r.key,
      label: r.key,
      value: r.share * 100,
      count: r.count,
      highlight: r.key !== "Other",
    }));
    const gender = DEPARTMENTS.map((d) => {
      const group = current.filter((e) => e.department === d);
      const f = group.filter((e) => e.gender === "Female").length;
      return { label: d, a: group.length ? (f / group.length) * 100 : 0, b: group.length ? ((group.length - f) / group.length) * 100 : 0, female: f, male: group.length - f };
    }).filter((g) => g.female + g.male > 0);
    const tenures = current.map((e) => tenureYearsAt(e, end));
    const tenure = TENURE_BANDS.map((band) => ({ label: band, count: tenures.filter((t) => tenureBand(t) === band).length }));
    const female = current.filter((e) => e.gender === "Female").length;
    const emirati = current.filter((e) => e.nationality === "UAE").length;
    const managers = current.filter((e) => e.isManager).length;
    const newJoiners = current.filter((e) => tenureYearsAt(e, end) < 0.5).length;
    return {
      current,
      n,
      bySite,
      byDept,
      nationality,
      gender,
      tenure,
      facts: [
        { label: "Median tenure", value: `${(median(tenures) ?? 0).toFixed(1)} yrs` },
        { label: "Female share", value: formatPercent(ratio(female, n)) },
        { label: "UAE nationals", value: `${formatNumber(emirati)} · ${formatPercent(ratio(emirati, n))}` },
        { label: "Nationalities", value: formatNumber(new Set(current.map((e) => e.nationality)).size) },
        { label: "Joined in last 6 months", value: formatNumber(newJoiners) },
        { label: "People managers", value: `${formatNumber(managers)} · 1:${Math.round((n - managers) / Math.max(1, managers))}` },
      ],
    };
  }, [employees, scope, end]);

  const directory = useMemo(() => {
    return employees.filter((e) => {
      if (!inScope(e, scope)) return false;
      const employed = isEmployedAt(e, end);
      const leftInPeriod = inPeriod(e.exitDate, period);
      if (view === "current") return employed;
      if (view === "leavers") return leftInPeriod;
      return employed || leftInPeriod;
    });
  }, [employees, scope, end, period, view]);

  const selectedId = searchParams.get("employee");
  const selected = selectedId ? employees.find((e) => e.id === selectedId) ?? null : null;

  if (model.n === 0) {
    return (
      <>
        <ScopeLine report={report} />
        <div className="rounded-lg border bg-card">
          <EmptyState />
        </div>
      </>
    );
  }

  return (
    <>
      <ScopeLine report={report} note={`Composition as at ${formatDate(end)}`} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Headcount by site" description={`${formatNumber(model.n)} employees on payroll.`}>
          <ChartFrame xLabel="Employees" summary={`Largest site: ${model.bySite[0]?.label} with ${model.bySite[0]?.value} employees.`}>
            <RankedBars
              data={model.bySite}
              format={formatNumber}
              labelWidth={128}
              rowHeight={26}
              tooltip={(d) => ({ title: d.label, rows: [{ label: "Employees", value: formatNumber(d.value) }, { label: "Share", value: formatPercent(d.share) }] })}
            />
          </ChartFrame>
        </Panel>
        <Panel title="Headcount by department" description="Clinical departments make up the majority of staff.">
          <ChartFrame xLabel="Employees" summary={`Largest department: ${model.byDept[0]?.label}.`}>
            <RankedBars
              data={model.byDept}
              format={formatNumber}
              tooltip={(d) => ({ title: d.label, rows: [{ label: "Employees", value: formatNumber(d.value) }, { label: "Share", value: formatPercent(d.share) }] })}
            />
          </ChartFrame>
        </Panel>
        <Panel title="Gender mix by department" description="Share of employees in each department.">
          <ChartFrame
            xLabel="Share of department (%)"
            legend={
              <Legend>
                <LegendItem color="var(--chart-1)" label="Female" />
                <LegendItem color="var(--chart-2)" label="Male" />
              </Legend>
            }
            summary="Nursing is predominantly female; Admin and Medical are closer to balanced."
          >
            <ShareBars
              data={model.gender}
              aLabel="Female"
              bLabel="Male"
              tooltip={(d) => ({
                title: d.label,
                rows: [
                  { label: "Female", value: `${formatNumber(d.female)} · ${pct(d.a)}`, color: "var(--chart-1)" },
                  { label: "Male", value: `${formatNumber(d.male)} · ${pct(d.b)}`, color: "var(--chart-2)" },
                ],
              })}
            />
          </ChartFrame>
        </Panel>
        <Panel title="Nationality" description="Top seven nationalities; the rest are grouped as Other.">
          <ChartFrame xLabel="Share of employees (%)" summary={`Largest nationality group: ${model.nationality[0]?.label}.`}>
            <RankedBars
              data={model.nationality}
              format={pct}
              axisFormat={(v) => `${Math.round(v)}%`}
              rowHeight={26}
              tooltip={(d) => ({ title: d.label, rows: [{ label: "Employees", value: formatNumber(d.count) }, { label: "Share", value: pct(d.value) }] })}
            />
          </ChartFrame>
        </Panel>
        <Panel title="Tenure distribution" description="Years of service at the period end.">
          <ChartFrame yLabel="Employees" xLabel="Tenure band (years)" summary="Distribution of employees by length of service.">
            <ColumnChart
              data={model.tenure}
              series={[{ key: "count", label: "Employees", color: "var(--chart-1)" }]}
              format={formatNumber}
              showTotals
              height={236}
              tooltip={(d) => ({ title: d.label, rows: [{ label: "Employees", value: formatNumber(d.count) }, { label: "Share", value: formatPercent(ratio(d.count, model.n)) }] })}
            />
          </ChartFrame>
        </Panel>
        <Panel title="At a glance" bodyClassName="p-0">
          <dl className="divide-y">
            {model.facts.map((f) => (
              <div key={f.label} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <dt className="text-muted-foreground">{f.label}</dt>
                <dd className="num font-medium">{f.value}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>

      <Panel
        className="mt-4"
        title="Employee directory"
        description="Select a row for the full profile. Export respects search, sorting and visible columns."
      >
        <DataTable
          data={directory}
          columns={directoryColumns}
          caption="Employee directory"
          searchText={(e) => `${e.name} ${e.id} ${e.role} ${e.nationality} ${e.managerName ?? ""}`}
          searchPlaceholder="Search name, ID, role…"
          initialSorting={[{ id: "name", desc: false }]}
          initialHidden={{ id: false, manager: false, band: false }}
          getRowId={(e) => e.id}
          exportName={`meridian-directory-${end}`}
          onRowClick={(e) => setParam("employee", e.id)}
          minWidth={980}
          toolbar={
            <Select value={view} onValueChange={(v) => setView(v as DirectoryView)}>
              <SelectTrigger size="sm" className="h-8 w-48" aria-label="Directory view">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Current employees</SelectItem>
                <SelectItem value="with-leavers">Current + leavers in period</SelectItem>
                <SelectItem value="leavers">Leavers in period</SelectItem>
              </SelectContent>
            </Select>
          }
        />
      </Panel>

      <EmployeeSheet employee={selected} asOf={end} onClose={() => setParam("employee", null)} />
    </>
  );
}

const directoryColumns: ColumnDef<Employee, unknown>[] = [
  {
    id: "name",
    accessorFn: (e) => e.name,
    header: "Employee",
    enableHiding: false,
    meta: { label: "Employee", csv: (e) => e.name },
    cell: ({ row }) => (
      <span className="flex flex-col leading-tight">
        <span className="font-medium text-foreground">{row.original.name}</span>
        <span className="num font-mono text-[11px] text-muted-foreground">{row.original.id}</span>
      </span>
    ),
  },
  { id: "id", accessorFn: (e) => e.id, header: "Employee ID", meta: { label: "Employee ID", csv: (e) => e.id, exportAlways: true, className: "num font-mono text-xs" } },
  { id: "role", accessorFn: (e) => e.role, header: "Role", meta: { label: "Role", csv: (e) => e.role } },
  { id: "department", accessorFn: (e) => e.department, header: "Department", meta: { label: "Department", csv: (e) => e.department } },
  { id: "site", accessorFn: (e) => siteShort(e.siteId), header: "Site", meta: { label: "Site", csv: (e) => siteShort(e.siteId) } },
  { id: "nationality", accessorFn: (e) => e.nationality, header: "Nationality", meta: { label: "Nationality", csv: (e) => e.nationality } },
  { id: "gender", accessorFn: (e) => e.gender, header: "Gender", meta: { label: "Gender", csv: (e) => e.gender } },
  {
    id: "hireDate",
    accessorFn: (e) => e.hireDate,
    header: "Hire date",
    meta: { label: "Hire date", csv: (e) => e.hireDate, className: "num" },
    cell: ({ row }) => formatDate(row.original.hireDate),
  },
  {
    id: "tenure",
    accessorFn: (e) => e.tenureYears,
    header: "Tenure",
    meta: { label: "Tenure (yrs)", csv: (e) => e.tenureYears, align: "right" },
    cell: ({ row }) => `${row.original.tenureYears.toFixed(1)} yrs`,
  },
  {
    id: "band",
    accessorFn: (e) => e.salaryBand,
    header: "Salary band",
    meta: { label: "Salary band", csv: (e) => `${e.salaryBand} (${SALARY_BAND_LABELS[e.salaryBand]})` },
    cell: ({ row }) => (
      <span>
        {row.original.salaryBand} <span className="text-muted-foreground">· {SALARY_BAND_LABELS[row.original.salaryBand]}</span>
      </span>
    ),
  },
  { id: "manager", accessorFn: (e) => e.managerName ?? "", header: "Manager", meta: { label: "Manager", csv: (e) => e.managerName ?? "" } },
  {
    id: "status",
    accessorFn: (e) => e.status,
    header: "Status",
    meta: { label: "Status", csv: (e) => (e.exitDate ? `Exited ${e.exitDate}` : e.status) },
    cell: ({ row }) => <EmployeeStatus employee={row.original} />,
  },
];

export function EmployeeStatus({ employee: e }: { employee: Employee }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground">
      <span
        className={e.status === "Exited" ? "size-1.5 rounded-full bg-muted-foreground/40" : "size-1.5 rounded-full bg-brand"}
        aria-hidden
      />
      {e.status}
    </span>
  );
}
