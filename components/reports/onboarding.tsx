"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ChartFrame, Legend, LegendItem } from "@/components/charts/chart-frame";
import { ColumnChart } from "@/components/charts/column-chart";
import { DataTable } from "@/components/data-table/data-table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { KpiCard, KpiRow, type KpiProps } from "@/components/dashboard/kpi-card";
import { Panel } from "@/components/dashboard/panel";
import { StatusBadge, type StatusTone } from "@/components/dashboard/status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDataset } from "@/lib/data";
import { formatDelta, formatNumber, formatPercent } from "@/lib/format";
import {
  atRiskCount,
  change,
  expiryBucket,
  expiryOn,
  iloeSummary,
  inScope,
  onboardingCompletion,
  taskStatus,
  type ExpiryBucket,
  type TaskStatus,
} from "@/lib/metrics";
import { addDaysIso, daysBetween, formatDate, monthEndDate } from "@/lib/months";
import { AS_OF, siteShort, SITES } from "@/lib/org";
import { ONBOARDING_ITEMS, type Credential, type OnboardingItem, type OnboardingRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ScopeLine } from "./scope-line";
import { useReport } from "./use-report";

const TASK_TONE: Record<TaskStatus, StatusTone> = {
  Done: "success",
  Overdue: "danger",
  "Due soon": "warning",
  Pending: "neutral",
};

const BUCKET_TONE: Record<ExpiryBucket, StatusTone> = {
  Overdue: "danger",
  "Due ≤ 30 days": "warning",
  "Due 31–60 days": "neutral",
  "Due 61–90 days": "neutral",
  "Valid > 90 days": "success",
};

const SHOWN_BUCKETS: ExpiryBucket[] = ["Overdue", "Due ≤ 30 days", "Due 31–60 days", "Due 61–90 days"];

interface JoinerRow extends OnboardingRecord {
  status: Partial<Record<OnboardingItem, TaskStatus>>;
  done: number;
  total: number;
  overdue: number;
}

interface CredentialRow extends Credential {
  expiry: string;
  days: number;
  bucket: ExpiryBucket;
}

export function OnboardingReport() {
  const report = useReport();
  const onboarding = useDataset("onboarding");
  const compliance = useDataset("compliance");
  const { scope, prevEnd, end, months, comparison } = report;
  const [bucketFilter, setBucketFilter] = useState<"all" | ExpiryBucket>("all");

  const model = useMemo(() => {
    const records = onboarding.filter((r) => inScope(r, scope));
    const credentials = compliance.credentials.filter((c) => inScope(c, scope));
    const iloe = compliance.iloe.filter((r) => inScope(r, scope));
    const monthEnd = (m: string) => (monthEndDate(m) < AS_OF ? monthEndDate(m) : AS_OF);

    const completion = onboardingCompletion(records, end);
    const prevCompletion = prevEnd ? onboardingCompletion(records, prevEnd) : null;
    const atRisk = atRiskCount(credentials, end);
    const prevAtRisk = prevEnd ? atRiskCount(credentials, prevEnd) : null;
    const iloeStats = iloeSummary(iloe);

    const kpis: KpiProps[] = [
      {
        label: "Onboarding completion",
        value: formatPercent(completion.rate, 0),
        delta: prevCompletion ? formatDelta(change(completion.rate, prevCompletion.rate), "pp") : null,
        deltaValue: prevCompletion ? change(completion.rate, prevCompletion.rate) : null,
        higherIsBetter: true,
        comparison,
        definition: "Checklist items completed ÷ items required, for joiners who started in the 90 days to the period end.",
        spark: months.map((m) => onboardingCompletion(records, monthEnd(m)).rate),
        sparkLabel: "Completion at each month end",
      },
      {
        label: "Overdue onboarding items",
        value: formatNumber(completion.overdue),
        delta: prevCompletion ? formatDelta(completion.overdue - prevCompletion.overdue, "count") : null,
        deltaValue: prevCompletion ? completion.overdue - prevCompletion.overdue : null,
        higherIsBetter: false,
        comparison,
        definition: "Checklist items past their due date and not completed, for joiners in the 90-day window.",
        spark: months.map((m) => onboardingCompletion(records, monthEnd(m)).overdue),
        sparkLabel: "Overdue items at each month end",
      },
      {
        label: "Credentials at risk",
        value: formatNumber(atRisk),
        delta: prevAtRisk !== null ? formatDelta(atRisk - prevAtRisk, "count") : null,
        deltaValue: prevAtRisk !== null ? atRisk - prevAtRisk : null,
        higherIsBetter: false,
        comparison,
        definition: "Medical licences and malpractice policies expired or expiring within 30 days, with no renewal on file.",
        spark: months.map((m) => atRiskCount(credentials, monthEnd(m))),
        sparkLabel: "Credentials at risk at each month end",
      },
      {
        label: "ILOE registration",
        value: formatPercent(iloeStats.registeredRate),
        delta: null,
        deltaValue: null,
        higherIsBetter: true,
        comparison: "",
        definition:
          "Share of current employees registered for the UAE Involuntary Loss of Employment scheme. Point-in-time status as at the data date; no history is held.",
        spark: [],
        sparkLabel: "",
      },
    ];

    const joiners: JoinerRow[] = records
      .filter((r) => r.startDate > addDaysIso(end, -90) && r.startDate <= end)
      .map((r) => {
        const status: JoinerRow["status"] = {};
        let done = 0;
        let overdue = 0;
        for (const t of r.tasks) {
          const s = taskStatus(t, end);
          status[t.item] = s;
          if (s === "Done") done++;
          if (s === "Overdue") overdue++;
        }
        return { ...r, status, done, total: r.tasks.length, overdue };
      })
      .sort((a, b) => b.startDate.localeCompare(a.startDate));

    const itemSummary = ONBOARDING_ITEMS.map((item) => {
      const relevant = joiners.filter((j) => j.status[item]);
      return {
        item,
        done: relevant.filter((j) => j.status[item] === "Done").length,
        overdue: relevant.filter((j) => j.status[item] === "Overdue").length,
        total: relevant.length,
      };
    });

    const credRows: CredentialRow[] = credentials
      .map((c) => {
        const expiry = expiryOn(c, end);
        if (!expiry) return null;
        return { ...c, expiry, days: daysBetween(end, expiry), bucket: expiryBucket(expiry, end) };
      })
      .filter((c): c is CredentialRow => c !== null && c.bucket !== "Valid > 90 days")
      .sort((a, b) => a.days - b.days);

    const timeline = SHOWN_BUCKETS.map((b) => ({
      label: b === "Due ≤ 30 days" ? "≤ 30 days" : b === "Due 31–60 days" ? "31–60 days" : b === "Due 61–90 days" ? "61–90 days" : "Overdue",
      bucket: b,
      licence: credRows.filter((c) => c.bucket === b && c.type === "Medical licence").length,
      malpractice: credRows.filter((c) => c.bucket === b && c.type === "Malpractice insurance").length,
    }));

    const iloeBySite = SITES.map((s) => {
      const st = iloeSummary(iloe.filter((r) => r.siteId === s.id));
      return { site: s, ...st };
    }).filter((r) => r.total > 0);

    return { kpis, joiners, itemSummary, credRows, timeline, iloeStats, iloeBySite, completion };
  }, [onboarding, compliance, scope, end, prevEnd, months, comparison]);

  const credFiltered = bucketFilter === "all" ? model.credRows : model.credRows.filter((c) => c.bucket === bucketFilter);

  return (
    <>
      <ScopeLine report={report} note={`Status as at ${formatDate(end)}`} />
      <KpiRow className="xl:grid-cols-4">
        {model.kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </KpiRow>

      <Panel
        className="mt-4"
        title="New-joiner checklist"
        description={`${formatNumber(model.joiners.length)} joiners started in the 90 days to ${formatDate(end)}. Licence and malpractice items apply to clinical staff only.`}
      >
        {model.joiners.length === 0 ? (
          <EmptyState title="No joiners in this window" description="No one started in the 90 days to the period end for this site and department." />
        ) : (
          <>
            <ul className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-3 lg:grid-cols-5">
              {model.itemSummary.map((s) => (
                <li key={s.item} className="bg-card px-3 py-2.5">
                  <p className="truncate text-xs text-muted-foreground">{s.item}</p>
                  <p className="num mt-0.5 text-sm font-medium">
                    {formatNumber(s.done)}
                    <span className="text-muted-foreground"> / {formatNumber(s.total)} done</span>
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div className="h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${s.total ? (s.done / s.total) * 100 : 0}%` }} />
                  </div>
                  {s.overdue > 0 && <p className="num mt-1.5 text-xs text-danger">{s.overdue} overdue</p>}
                </li>
              ))}
            </ul>
            <DataTable
              data={model.joiners}
              columns={joinerColumns}
              caption="New-joiner onboarding checklist"
              searchText={(j) => `${j.name} ${j.employeeId} ${j.role} ${siteShort(j.siteId)}`}
              searchPlaceholder="Search joiner, role, site…"
              initialSorting={[{ id: "overdue", desc: true }]}
              getRowId={(j) => j.employeeId}
              exportName={`meridian-onboarding-${end}`}
              pageSize={10}
              minWidth={1120}
            />
          </>
        )}
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Licence & malpractice expiry timeline"
          description="Credentials for current clinical staff that are expired or due within 90 days, with no renewal on file."
        >
          <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
            {model.timeline.map((t) => {
              const count = t.licence + t.malpractice;
              const active = bucketFilter === t.bucket;
              return (
                <button
                  key={t.bucket}
                  type="button"
                  onClick={() => setBucketFilter(active ? "all" : t.bucket)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-md border px-3 py-2.5 text-left outline-none transition-colors duration-150 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                    active && "border-brand-border bg-brand-subtle",
                  )}
                >
                  <StatusBadge tone={BUCKET_TONE[t.bucket]}>{t.label}</StatusBadge>
                  <p className="num mt-2 text-2xl font-semibold">{formatNumber(count)}</p>
                  <p className="num text-xs text-muted-foreground">
                    {t.licence} licence · {t.malpractice} malpractice
                  </p>
                </button>
              );
            })}
          </div>
          <ChartFrame
            yLabel="Credentials (count)"
            xLabel="Time to expiry, as at the period end"
            legend={
              <Legend>
                <LegendItem color="var(--chart-1)" label="Medical licence" />
                <LegendItem color="var(--chart-2)" label="Malpractice insurance" />
              </Legend>
            }
            summary={model.timeline.map((t) => `${t.label}: ${t.licence + t.malpractice}`).join(", ")}
          >
            <ColumnChart
              data={model.timeline}
              series={[
                { key: "licence", label: "Medical licence", color: "var(--chart-1)" },
                { key: "malpractice", label: "Malpractice insurance", color: "var(--chart-2)" },
              ]}
              stacked
              showTotals
              format={formatNumber}
              height={200}
              tooltip={(d) => ({
                title: d.label,
                rows: [
                  { label: "Medical licence", value: formatNumber(d.licence), color: "var(--chart-1)" },
                  { label: "Malpractice insurance", value: formatNumber(d.malpractice), color: "var(--chart-2)" },
                ],
              })}
            />
          </ChartFrame>
        </Panel>

        <Panel title="ILOE registration" description={`Involuntary Loss of Employment insurance, as at ${formatDate(AS_OF)}.`}>
          {model.iloeStats.total === 0 ? (
            <EmptyState />
          ) : (
            <>
              <div className="flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${model.iloeStats.Registered} registered, ${model.iloeStats.Pending} pending, ${model.iloeStats["Not registered"]} not registered`}>
                <div className="h-full bg-[var(--chart-1)]" style={{ width: `${(model.iloeStats.Registered / model.iloeStats.total) * 100}%` }} />
                <div className="h-full border-l-2 border-card bg-warning" style={{ width: `${(model.iloeStats.Pending / model.iloeStats.total) * 100}%` }} />
                <div className="h-full border-l-2 border-card bg-danger" style={{ width: `${(model.iloeStats["Not registered"] / model.iloeStats.total) * 100}%` }} />
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                {(
                  [
                    ["Registered", "success"],
                    ["Pending", "warning"],
                    ["Not registered", "danger"],
                  ] as const
                ).map(([k, tone]) => (
                  <div key={k}>
                    <dt>
                      <StatusBadge tone={tone}>{k}</StatusBadge>
                    </dt>
                    <dd className="num mt-1 text-lg font-semibold">{formatNumber(model.iloeStats[k])}</dd>
                  </div>
                ))}
              </dl>
              <table className="num mt-4 w-full text-xs">
                <caption className="sr-only">ILOE registration by site</caption>
                <thead className="text-muted-foreground">
                  <tr className="border-b">
                    <th scope="col" className="py-1.5 text-left font-medium">Site</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Registered</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Not reg.</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {model.iloeBySite.map((r) => (
                    <tr key={r.site.id}>
                      <th scope="row" className="py-1.5 text-left font-normal">{r.site.short}</th>
                      <td className="py-1.5 text-right">{formatPercent(r.registeredRate)}</td>
                      <td className={cn("py-1.5 text-right", r["Not registered"] > 0 && "font-medium text-danger")}>{r["Not registered"]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Panel>
      </div>

      <Panel
        className="mt-4"
        title="Credentials needing action"
        description="Select a bucket above to filter. Export to send renewal reminders to line managers."
      >
        <DataTable
          data={credFiltered}
          columns={credentialColumns}
          caption="Licences and malpractice policies due within 90 days or overdue"
          searchText={(c) => `${c.name} ${c.employeeId} ${c.role} ${c.issuer} ${siteShort(c.siteId)}`}
          searchPlaceholder="Search name, role, issuer…"
          initialSorting={[{ id: "days", desc: false }]}
          getRowId={(c) => c.id}
          exportName={`meridian-credentials-${end}`}
          pageSize={10}
          emptyMessage="No credentials are overdue or due within 90 days for this selection."
          minWidth={960}
          toolbar={
            <Select value={bucketFilter} onValueChange={(v) => setBucketFilter(v as typeof bucketFilter)}>
              <SelectTrigger size="sm" className="h-8 w-44" aria-label="Expiry bucket">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All within 90 days</SelectItem>
                {SHOWN_BUCKETS.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      </Panel>
    </>
  );
}

const ITEM_SHORT: Record<OnboardingItem, string> = {
  "Documents & visa": "Documents",
  "Biometric access": "Biometric",
  "Medical insurance": "Medical ins.",
  "Malpractice insurance": "Malpractice",
  "Licence activation": "Licence",
};

const joinerColumns: ColumnDef<JoinerRow, unknown>[] = [
  {
    id: "name",
    accessorFn: (j) => j.name,
    header: "Joiner",
    enableHiding: false,
    meta: { label: "Joiner", csv: (j) => j.name },
    cell: ({ row }) => (
      <span className="flex flex-col leading-tight">
        <span className="font-medium text-foreground">{row.original.name}</span>
        <span className="text-[11px] text-muted-foreground">
          {row.original.role} · {siteShort(row.original.siteId)}
        </span>
      </span>
    ),
  },
  {
    id: "start",
    accessorFn: (j) => j.startDate,
    header: "Start date",
    meta: { label: "Start date", csv: (j) => j.startDate, className: "num" },
    cell: ({ row }) => formatDate(row.original.startDate),
  },
  {
    id: "progress",
    accessorFn: (j) => j.done / j.total,
    header: "Progress",
    meta: { label: "Progress", csv: (j) => `${j.done}/${j.total}` },
    cell: ({ row }) => {
      const { done, total } = row.original;
      return (
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span className="block h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${(done / total) * 100}%` }} />
          </span>
          <span className="num text-xs text-muted-foreground">
            {done}/{total}
          </span>
        </span>
      );
    },
  },
  { id: "overdue", accessorFn: (j) => j.overdue, header: "Overdue", meta: { label: "Overdue items", csv: (j) => j.overdue, align: "right" } },
  ...ONBOARDING_ITEMS.map(
    (item): ColumnDef<JoinerRow, unknown> => ({
      id: item,
      accessorFn: (j) => j.status[item] ?? "N/A",
      header: ITEM_SHORT[item],
      enableSorting: false,
      meta: { label: item, csv: (j) => j.status[item] ?? "N/A" },
      cell: ({ row }) => {
        const s = row.original.status[item];
        return s ? <StatusBadge tone={TASK_TONE[s]}>{s}</StatusBadge> : <span className="text-xs text-muted-foreground">N/A</span>;
      },
    }),
  ),
];

const credentialColumns: ColumnDef<CredentialRow, unknown>[] = [
  {
    id: "name",
    accessorFn: (c) => c.name,
    header: "Holder",
    enableHiding: false,
    meta: { label: "Holder", csv: (c) => c.name },
    cell: ({ row }) => (
      <span className="flex flex-col leading-tight">
        <span className="font-medium text-foreground">{row.original.name}</span>
        <span className="num font-mono text-[11px] text-muted-foreground">{row.original.employeeId}</span>
      </span>
    ),
  },
  { id: "role", accessorFn: (c) => c.role, header: "Role", meta: { label: "Role", csv: (c) => c.role } },
  { id: "site", accessorFn: (c) => siteShort(c.siteId), header: "Site", meta: { label: "Site", csv: (c) => siteShort(c.siteId) } },
  { id: "type", accessorFn: (c) => c.type, header: "Credential", meta: { label: "Credential", csv: (c) => c.type } },
  { id: "issuer", accessorFn: (c) => c.issuer, header: "Issuer", meta: { label: "Issuer", csv: (c) => c.issuer } },
  {
    id: "expiry",
    accessorFn: (c) => c.expiry,
    header: "Expiry",
    meta: { label: "Expiry date", csv: (c) => c.expiry, className: "num" },
    cell: ({ row }) => formatDate(row.original.expiry),
  },
  {
    id: "days",
    accessorFn: (c) => c.days,
    header: "Days",
    meta: { label: "Days to expiry", csv: (c) => c.days, align: "right" },
    cell: ({ row }) => (row.original.days < 0 ? `${Math.abs(row.original.days)} ago` : row.original.days),
  },
  {
    id: "bucket",
    accessorFn: (c) => c.bucket,
    header: "Status",
    meta: { label: "Status", csv: (c) => c.bucket },
    cell: ({ row }) => <StatusBadge tone={BUCKET_TONE[row.original.bucket]}>{row.original.bucket}</StatusBadge>,
  },
];
