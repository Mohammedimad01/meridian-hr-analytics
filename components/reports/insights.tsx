"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ChartFrame, Legend, LegendItem } from "@/components/charts/chart-frame";
import { ColumnChart } from "@/components/charts/column-chart";
import { RankedBars } from "@/components/charts/ranked-bars";
import { EmptyState } from "@/components/dashboard/empty-state";
import { withQuery } from "@/hooks/use-filters";
import { useDataset } from "@/lib/data";
import { writeFilters } from "@/lib/filters";
import { formatDays, formatNumber, formatPercent } from "@/lib/format";
import {
  attritionBy,
  bucketCounts,
  checkInCoverage,
  exitReasons,
  expiryOn,
  inPeriod,
  inScope,
  isAtRisk,
  mean,
  median,
  monthlyTotals,
  ratio,
  sourceEffectiveness,
  summarizeAttrition,
  summarizePulse,
  surveyQuartersInPeriod,
} from "@/lib/metrics";
import { addDaysIso, daysBetween, formatDate, formatMonth, formatQuarter } from "@/lib/months";
import { AS_OF, SITE_BY_ID, SITES } from "@/lib/org";
import { ScopeLine } from "./scope-line";
import { useReport } from "./use-report";


interface Finding {
  id: string;
  title: string;
  body: React.ReactNode;
  action: React.ReactNode;
  chart: React.ReactNode;
  href: string;
  linkLabel: string;
}

const x = (v: number | null) => (v === null || !Number.isFinite(v) ? "—" : `${v.toFixed(1)}×`);

export function InsightsReport() {
  const report = useReport();
  const snapshots = useDataset("snapshots");
  const employees = useDataset("employees");
  const requisitions = useDataset("requisitions");
  const onboarding = useDataset("onboarding");
  const compliance = useDataset("compliance");
  const engagement = useDataset("engagement");
  const { period, scope, months, end, filters } = report;

  const findings = useMemo(() => {
    const out: (Finding | { id: string; title: string; unavailable: string })[] = [];

    /* 1. Nursing attrition ------------------------------------------------ */
    {
      const deptScope = { siteId: scope.siteId, department: null };
      const byDept = attritionBy(snapshots, "department", deptScope, months).sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));
      const nursing = byDept.find((d) => d.key === "Nursing");
      const others = byDept.filter((d) => d.key !== "Nursing");
      const otherExits = others.reduce((a, d) => a + d.exits, 0);
      const otherAvg = others.reduce((a, d) => a + d.avgHeadcount, 0);
      const otherRate = otherAvg ? (otherExits / otherAvg) * (12 / months.length) : null;
      if (scope.department && scope.department !== "Nursing") {
        out.push({ id: "nursing", title: "Nursing attrition", unavailable: "This finding compares Nursing with other departments. Clear the department filter to see it." });
      } else if (nursing && nursing.rate !== null && otherRate) {
        const totalExits = nursing.exits + otherExits;
        const reasons = exitReasons(snapshots, { siteId: scope.siteId, department: "Nursing" }, months);
        const burnout = reasons.find((r) => r.reason === "Workload & burnout");
        const pay = reasons.find((r) => r.reason === "Better pay elsewhere");
        out.push({
          id: "nursing",
          title: `Nursing attrition runs at ${x(nursing.rate / otherRate)} the rest of the workforce`,
          body: (
            <>
              Nursing lost staff at an annualised <strong>{formatPercent(nursing.rate)}</strong> against <strong>{formatPercent(otherRate)}</strong> for all other
              departments combined. Nurses are {formatPercent(ratio(nursing.avgHeadcount, nursing.avgHeadcount + otherAvg), 0)} of headcount but{" "}
              <strong>{formatPercent(ratio(nursing.exits, totalExits), 0)} of exits</strong> ({formatNumber(nursing.exits)} of {formatNumber(totalExits)}). Workload and burnout
              ({formatPercent(burnout?.share ?? 0, 0)}) and pay ({formatPercent(pay?.share ?? 0, 0)}) together account for{" "}
              {formatPercent((burnout?.share ?? 0) + (pay?.share ?? 0), 0)} of nursing exits, which points to controllable causes rather than relocation alone.
            </>
          ),
          action: (
            <>
              Launch a nursing retention plan: stay interviews at 3, 6 and 12 months; review rota design and patient ratios on the highest-turnover units; and benchmark Staff Nurse
              pay (bands B2–B3) against DHA-licensed competitors. Track nursing attrition monthly against a target of under 20%.
            </>
          ),
          chart: (
            <ChartFrame xLabel="Annualised attrition rate (%)" summary={`Nursing ${formatPercent(nursing.rate)} versus ${formatPercent(otherRate)} for other departments.`}>
              <RankedBars
                data={byDept.map((d) => ({ key: d.key, label: d.key, value: (d.rate ?? 0) * 100, highlight: d.key === "Nursing", exits: d.exits }))}
                format={(v) => `${v.toFixed(1)}%`}
                axisFormat={(v) => `${Math.round(v)}%`}
                rowHeight={28}
                tooltip={(d) => ({ title: d.label, rows: [{ label: "Attrition", value: `${d.value.toFixed(1)}%` }, { label: "Exits", value: formatNumber(d.exits) }] })}
              />
            </ChartFrame>
          ),
          href: "/attrition/",
          linkLabel: "Open attrition report",
        });
      }
    }

    /* 2. Summer exit spike ------------------------------------------------ */
    {
      const totals = monthlyTotals(snapshots, scope, months);
      const isSummer = (m: string) => ["06", "07", "08"].includes(m.slice(5));
      const summer = totals.filter((t) => isSummer(t.month));
      const rest = totals.filter((t) => !isSummer(t.month));
      if (summer.length === 0 || rest.length === 0) {
        out.push({ id: "summer", title: "Summer exit spike", unavailable: "Choose a date range that includes June to August and at least one other month to compare." });
      } else {
        const summerAvg = mean(summer.map((t) => t.exitsVoluntary)) ?? 0;
        const restAvg = mean(rest.map((t) => t.exitsVoluntary)) ?? 0;
        const summerShare = ratio(summer.reduce((a, t) => a + t.exitsVoluntary, 0), totals.reduce((a, t) => a + t.exitsVoluntary, 0));
        const expectedShare = summer.length / totals.length;
        const summerReasons = exitReasons(snapshots, scope, summer.map((t) => t.month));
        const relocation = summerReasons.filter((r) => r.reason === "Relocation / returning home" || r.reason === "Family reasons").reduce((a, r) => a + r.share, 0);
        out.push({
          id: "summer",
          title: `Voluntary exits rise ${formatPercent(restAvg ? summerAvg / restAvg - 1 : null, 0)} in June to August`,
          body: (
            <>
              The summer months averaged <strong>{summerAvg.toFixed(1)} voluntary exits a month</strong> against {restAvg.toFixed(1)} in the rest of the period. June to August is{" "}
              {formatPercent(expectedShare, 0)} of the calendar but produced <strong>{formatPercent(summerShare, 0)} of resignations</strong>. Relocation and family reasons explain{" "}
              {formatPercent(relocation, 0)} of summer exits, consistent with expatriate staff timing moves around the school year and contract anniversaries.
            </>
          ),
          action: (
            <>
              Treat summer as a planned event. Run stay conversations in March and April with staff whose contracts or visas renew mid-year, pre-open replacement requisitions in April for
              roles with known leavers, and agree a nursing agency bench with fixed summer rates before demand peaks.
            </>
          ),
          chart: (
            <ChartFrame
              yLabel="Voluntary exits (employees)"
              xLabel="Month"
              legend={
                <Legend>
                  <LegendItem color="var(--chart-1)" label="Jun–Aug" />
                  <LegendItem color="color-mix(in oklab, var(--chart-1) 45%, transparent)" label="Other months" />
                </Legend>
              }
              summary={`Summer average ${summerAvg.toFixed(1)} exits a month versus ${restAvg.toFixed(1)}.`}
            >
              <ColumnChart
                data={totals.map((t) => ({ label: formatMonth(t.month), exits: t.exitsVoluntary, summer: isSummer(t.month) }))}
                series={[{ key: "exits", label: "Voluntary exits", color: "var(--chart-1)" }]}
                highlight={(d) => d.summer}
                format={formatNumber}
                height={220}
                tooltip={(d) => ({ title: d.label, rows: [{ label: "Voluntary exits", value: formatNumber(d.exits) }] })}
              />
            </ChartFrame>
          ),
          href: "/attrition/",
          linkLabel: "Open attrition report",
        });
      }
    }

    /* 3. Engagement outlier ---------------------------------------------- */
    {
      const quarters = surveyQuartersInPeriod(period);
      const lastQ = quarters.at(-1);
      const firstQ = [...new Set(engagement.pulse.map((p) => p.quarter))].sort()[0];
      const deptScope = { siteId: null, department: scope.department };
      if (scope.siteId) {
        out.push({ id: "engagement", title: "Engagement outlier", unavailable: "This finding compares sites. Clear the site filter to see it." });
      } else if (!lastQ) {
        out.push({ id: "engagement", title: "Engagement outlier", unavailable: "No quarterly survey closed in this date range. Widen it to include a quarter end." });
      } else {
        const bySite = SITES.map((s) => {
          const sum = summarizePulse(engagement.pulse.filter((p) => p.siteId === s.id && p.quarter === lastQ && inScope(p, deptScope)));
          return { key: s.id, label: s.short, value: sum.score ?? 0, enps: sum.enps, responses: sum.responses };
        }).filter((s) => s.responses > 0);
        const sorted = [...bySite].sort((a, b) => b.value - a.value);
        const low = sorted.at(-1)!;
        const others = bySite.filter((s) => s.key !== low.key);
        const othersAvg = mean(others.map((s) => s.value)) ?? 0;
        const firstScore = summarizePulse(engagement.pulse.filter((p) => p.siteId === low.key && p.quarter === firstQ && inScope(p, deptScope))).score;
        const lastLogMonth = months.filter((m) => engagement.checkIns.some((l) => l.month === m)).at(-1);
        const logs = engagement.checkIns.filter((l) => l.month === lastLogMonth && inScope(l, deptScope));
        const covLow = checkInCoverage(logs.filter((l) => l.siteId === low.key));
        const covRest = checkInCoverage(logs.filter((l) => l.siteId !== low.key));
        const attLow = summarizeAttrition(monthlyTotals(snapshots, { ...deptScope, siteId: low.key }, months)).rate;
        const allTotals = monthlyTotals(snapshots, deptScope, months);
        const lowTotals = monthlyTotals(snapshots, { ...deptScope, siteId: low.key }, months);
        const restRate = summarizeAttrition(
          allTotals.map((t, i) => {
            const l = lowTotals[i]!;
            return {
              ...t,
              headcountStart: t.headcountStart - l.headcountStart,
              headcountEnd: t.headcountEnd - l.headcountEnd,
              exits: t.exits - l.exits,
              exitsVoluntary: t.exitsVoluntary - l.exitsVoluntary,
              exitsInvoluntary: t.exitsInvoluntary - l.exitsInvoluntary,
            };
          }),
        ).rate;
        const mgrShare = exitReasons(snapshots, { ...deptScope, siteId: low.key }, months).find((r) => r.reason === "Manager relationship")?.share ?? 0;
        const site = SITE_BY_ID[low.key]!;
        out.push({
          id: "engagement",
          title: `${low.label} trails every other site on engagement, by ${(othersAvg - low.value).toFixed(0)} points`,
          body: (
            <>
              {site.name} ({site.emirate}) scored <strong>{low.value.toFixed(1)}</strong> on the {formatQuarter(lastQ)} pulse against an average of {othersAvg.toFixed(1)} for the other sites
              {firstScore !== null && firstScore !== undefined ? <>, down from {firstScore.toFixed(1)} in {formatQuarter(firstQ!)}</> : null}. The same site has{" "}
              <strong>{formatPercent(covLow, 0)} 1-on-1 coverage</strong> (rest of group {formatPercent(covRest, 0)}) and annualised attrition of{" "}
              <strong>{formatPercent(attLow)}</strong> versus {formatPercent(restRate)} elsewhere. {formatPercent(mgrShare, 0)} of its leavers cite their manager relationship.
              Low engagement, thin manager contact and high turnover are appearing together, which usually indicates a local leadership issue rather than a pay or market one.
            </>
          ),
          action: (
            <>
              Assign the HR business partner to a 60-day site review: skip-level listening sessions, a 1-on-1 cadence of every two weeks for all line managers, and coaching for the clinic
              leadership team. Re-pulse the site after 90 days and report engagement, coverage and voluntary exits together.
            </>
          ),
          chart: (
            <ChartFrame xLabel={`Engagement index, ${formatQuarter(lastQ)} (0–100)`} summary={`${low.label} ${low.value.toFixed(1)} versus ${othersAvg.toFixed(1)} for other sites.`}>
              <RankedBars
                data={sorted.map((s) => ({ ...s, highlight: s.key === low.key }))}
                format={(v) => v.toFixed(1)}
                axisFormat={(v) => `${Math.round(v)}`}
                labelWidth={112}
                rowHeight={24}
                domainMax={100}
                reference={{ value: othersAvg, label: `Others ${othersAvg.toFixed(1)}` }}
                tooltip={(d) => ({ title: d.label, rows: [{ label: "Engagement index", value: d.value.toFixed(1) }, { label: "Responses", value: formatNumber(d.responses) }] })}
              />
            </ChartFrame>
          ),
          href: "/engagement/",
          linkLabel: "Open engagement report",
        });
      }
    }

    /* 4. Referral vs job boards ------------------------------------------ */
    {
      const reqs = requisitions.filter((r) => inScope(r, scope) && inPeriod(r.openedAt, period));
      const stats = sourceEffectiveness(reqs);
      const ref = stats.find((s) => s.source === "Employee referral");
      const jb = stats.find((s) => s.source === "Job boards");
      if (!ref?.conversion || !jb?.conversion) {
        out.push({ id: "sources", title: "Referral performance", unavailable: "Not enough applicants from both referrals and job boards in this selection to compare." });
      } else {
        const cutoff = addDaysIso(AS_OF, -365);
        const cohort = employees.filter((e) => e.source && inScope(e, scope) && e.hireDate <= cutoff);
        const earlyRate = (rows: typeof cohort) => ratio(rows.filter((e) => e.exitDate && daysBetween(e.hireDate, e.exitDate) < 365).length, rows.length);
        const refEarly = earlyRate(cohort.filter((e) => e.source === "Employee referral"));
        const otherEarly = earlyRate(cohort.filter((e) => e.source !== "Employee referral"));
        const applicants = stats.reduce((a, s) => a + s.applicants, 0);
        out.push({
          id: "sources",
          title: `Employee referrals convert ${x(ref.conversion / jb.conversion)} better than job boards`,
          body: (
            <>
              Referrals turned <strong>{formatPercent(ref.conversion)}</strong> of applicants into hires; job boards managed <strong>{formatPercent(jb.conversion)}</strong>. Referrals
              were {formatPercent(ratio(ref.applicants, applicants), 0)} of applicants but {formatPercent(ref.shareOfHires, 0)} of hires, and filled roles in{" "}
              {formatDays(ref.avgTimeToHire)} against {formatDays(jb.avgTimeToHire)}.{" "}
              {refEarly !== null && otherEarly !== null && otherEarly - refEarly >= 0.03 ? (
                <>
                  Referral hires also stay: <strong>{formatPercent(refEarly, 0)} left within their first year</strong>, compared with {formatPercent(otherEarly, 0)} for other
                  sources.
                </>
              ) : (
                <>
                  First-year attrition is similar ({formatPercent(refEarly, 0)} for referral hires, {formatPercent(otherEarly, 0)} for other sources), so the advantage is yield and
                  speed rather than retention.
                </>
              )}{" "}
              Retention figures use hires with a full year of tenure observed.
            </>
          ),
          action: (
            <>
              Formalise the referral programme: a tiered bonus paid at the end of probation (higher for nursing and specialist roles), a quarterly referral drive in hard-to-fill units, and
              monthly source reporting. Rebalance job-board spend towards the two or three boards that produce interviews, not just applications.
            </>
          ),
          chart: (
            <ChartFrame xLabel="Applicant-to-hire conversion (%)" summary={`Referral ${formatPercent(ref.conversion)} versus job boards ${formatPercent(jb.conversion)}.`}>
              <RankedBars
                data={stats.filter((s) => s.applicants > 0).map((s) => ({ key: s.source, label: s.source, value: (s.conversion ?? 0) * 100, highlight: s.source === "Employee referral", s }))}
                format={(v) => `${v.toFixed(1)}%`}
                axisFormat={(v) => `${Math.round(v)}%`}
                labelWidth={128}
                rowHeight={28}
                tooltip={(d) => ({
                  title: d.label,
                  rows: [
                    { label: "Conversion", value: formatPercent(d.s.conversion) },
                    { label: "Applicants", value: formatNumber(d.s.applicants) },
                    { label: "Hires", value: formatNumber(d.s.hires) },
                  ],
                })}
              />
            </ChartFrame>
          ),
          href: "/recruitment/",
          linkLabel: "Open recruitment report",
        });
      }
    }

    /* 5. Credential renewals --------------------------------------------- */
    {
      const creds = compliance.credentials.filter((c) => inScope(c, scope));
      const atRisk = creds.filter((c) => isAtRisk(c, end));
      const buckets = bucketCounts(creds, end);
      const tracked = creds.filter((c) => expiryOn(c, end) !== null);
      if (tracked.length === 0) {
        out.push({ id: "compliance", title: "Credential renewals", unavailable: "No clinical credentials in this selection." });
      } else {
        const mohap = (c: { siteId: string }) => SITE_BY_ID[c.siteId]?.regulator === "MOHAP";
        const mohapRisk = ratio(atRisk.filter(mohap).length, atRisk.length);
        const mohapBase = ratio(tracked.filter(mohap).length, tracked.length);
        const licenceTasks = onboarding
          .filter((r) => inScope(r, scope) && inPeriod(r.startDate, period))
          .flatMap((r) => r.tasks.filter((t) => t.item === "Licence activation" && t.completedAt));
        const late = licenceTasks.filter((t) => t.completedAt! > t.dueDate);
        const medLate = median(late.map((t) => daysBetween(t.dueDate, t.completedAt!)));
        out.push({
          id: "compliance",
          title: `${formatNumber(atRisk.length)} licences and malpractice policies are expired or due within 30 days`,
          body: (
            <>
              As at {formatDate(end)}, <strong>{formatNumber(buckets["Overdue"])} credentials have lapsed</strong> and {formatNumber(buckets["Due ≤ 30 days"])} expire within 30 days without a
              renewal on file; a further {formatNumber(buckets["Due 31–60 days"] + buckets["Due 61–90 days"])} fall due in 31–90 days. Sharjah (MOHAP-regulated) clinics hold{" "}
              {formatPercent(mohapBase, 0)} of credentials but <strong>{formatPercent(mohapRisk, 0)} of those at risk</strong>. New joiners show the same friction:{" "}
              {formatPercent(ratio(late.length, licenceTasks.length), 0)} of licence activations finished after their due date
              {medLate !== null ? <>, by a median of {formatDays(medLate)}</> : null}. A lapsed licence means the clinician cannot practise, so this is both a compliance and a capacity risk.
            </>
          ),
          action: (
            <>
              Move to automated reminders at 90, 60 and 30 days to the holder and their line manager, with lapsed items escalated to the Medical Director the same day. Stand up a single
              licensing desk for the Sharjah clinics and start MOHAP activation paperwork at offer acceptance rather than on day one.
            </>
          ),
          chart: (
            <ChartFrame
              yLabel="Credentials (count)"
              xLabel={`Time to expiry as at ${formatDate(end)}`}
              summary={`${buckets["Overdue"]} overdue, ${buckets["Due ≤ 30 days"]} due within 30 days.`}
            >
              <ColumnChart
                data={[
                  { label: "Overdue", count: buckets["Overdue"], urgent: true },
                  { label: "≤ 30 days", count: buckets["Due ≤ 30 days"], urgent: true },
                  { label: "31–60 days", count: buckets["Due 31–60 days"], urgent: false },
                  { label: "61–90 days", count: buckets["Due 61–90 days"], urgent: false },
                ]}
                series={[{ key: "count", label: "Credentials", color: "var(--chart-1)" }]}
                highlight={(d) => d.urgent}
                showTotals
                format={formatNumber}
                height={220}
                tooltip={(d) => ({ title: d.label, rows: [{ label: "Credentials", value: formatNumber(d.count) }] })}
              />
            </ChartFrame>
          ),
          href: "/onboarding/",
          linkLabel: "Open onboarding & compliance",
        });
      }
    }

    return out;
  }, [snapshots, employees, requisitions, onboarding, compliance, engagement, period, scope, months, end]);

  const query = writeFilters(filters).toString();

  return (
    <>
      <ScopeLine report={report} />
      <article className="rounded-lg border bg-card">
        <header className="grid gap-x-8 gap-y-1 border-b px-4 py-4 text-sm sm:grid-cols-[auto_1fr] md:px-6">
          <span className="text-muted-foreground">To</span>
          <span>HR Leadership Team, Meridian Health Group</span>
          <span className="text-muted-foreground">From</span>
          <span>People Analytics</span>
          <span className="text-muted-foreground">Date</span>
          <span className="num">{formatDate(AS_OF)}</span>
          <span className="text-muted-foreground">Re</span>
          <span>
            Workforce risks and recommended actions, {report.periodLabel} ({report.scopeLabel})
          </span>
        </header>
        <p className="border-b px-4 py-4 text-sm leading-relaxed text-muted-foreground md:px-6">
          Five findings from the period, ranked by their likely impact on clinical capacity. Each is calculated live from the current filters and paired with the evidence and a
          recommended HR action. All data is synthetic.
        </p>
        <ol>
          {findings.map((f, i) => (
            <li key={f.id} className="border-b last:border-b-0">
              <section aria-labelledby={`finding-${f.id}`} className="grid gap-6 px-4 py-6 md:px-6 lg:grid-cols-5">
                <div className="lg:col-span-2">
                  <p className="num text-xs font-medium text-muted-foreground">Finding {i + 1}</p>
                  <h2 id={`finding-${f.id}`} className="mt-1 text-base leading-snug font-semibold text-balance">
                    {f.title}
                  </h2>
                  {"unavailable" in f ? (
                    <EmptyState className="mt-4 items-start px-0 py-4 text-left" title="Not available for this selection" description={f.unavailable} />
                  ) : (
                    <>
                      <p className="mt-3 text-sm leading-relaxed text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground">{f.body}</p>
                      <div className="mt-4 rounded-md border-l-2 border-brand bg-brand-subtle px-3 py-2.5">
                        <p className="text-xs font-medium text-brand">Recommended action</p>
                        <p className="mt-1 text-sm leading-relaxed">{f.action}</p>
                      </div>
                      <Link
                        href={withQuery(f.href, query)}
                        className="mt-3 inline-flex items-center gap-1 rounded text-xs font-medium text-brand underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {f.linkLabel}
                        <ArrowUpRight className="size-3.5" aria-hidden />
                      </Link>
                    </>
                  )}
                </div>
                {!("unavailable" in f) && <div className="min-w-0 lg:col-span-3">{f.chart}</div>}
              </section>
            </li>
          ))}
        </ol>
      </article>
    </>
  );
}
