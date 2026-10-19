import { describe, expect, it } from "vitest";
import {
  attritionRate,
  averageHeadcount,
  atRiskCount,
  bucketCounts,
  checkInCoverage,
  earlyExitShare,
  enps,
  expiryBucket,
  expiryOn,
  firstYearAttritionByCohort,
  funnelTotals,
  monthlyTotals,
  offerAcceptanceRate,
  onboardingCompletion,
  previousPeriod,
  rollingAttrition,
  sourceEffectiveness,
  stageConversion,
  summarizeAttrition,
  summarizePulse,
  taskStatus,
  timeToFillDays,
  timeToHireDays,
  averageTimeToHire,
  hiresInPeriod,
  ALL_SCOPE,
  type MonthTotals,
} from "./metrics";
import type { CheckInLog, Credential, Employee, MonthlySnapshot, OnboardingRecord, PulseResult, Requisition } from "./types";

/* ---------- fixtures ---------- */

function snapshot(partial: Partial<MonthlySnapshot>): MonthlySnapshot {
  return {
    month: "2026-01",
    siteId: "barsha",
    department: "Nursing",
    headcountStart: 100,
    headcountEnd: 100,
    hires: 0,
    exitsVoluntary: 0,
    exitsInvoluntary: 0,
    exitReasons: {},
    ...partial,
  };
}

function req(partial: Partial<Requisition>): Requisition {
  return {
    id: "REQ-2026-0001",
    title: "Staff Nurse",
    department: "Nursing",
    siteId: "barsha",
    hiringManager: "A",
    recruiter: "B",
    priority: "Normal",
    status: "Filled",
    openedAt: "2026-01-01",
    stages: { screenedAt: null, interviewedAt: null, offeredAt: null, filledAt: null },
    closedAt: null,
    funnel: {},
    offersMade: 1,
    offersAccepted: 1,
    hire: null,
    ...partial,
  };
}

function credential(partial: Partial<Credential>): Credential {
  return {
    id: "CR-1",
    employeeId: "MHG-1",
    name: "Test",
    role: "Staff Nurse",
    department: "Nursing",
    siteId: "barsha",
    type: "Medical licence",
    issuer: "DHA",
    expiryDate: "2026-12-31",
    previousExpiryDate: "2025-12-31",
    renewedOn: "2025-12-01",
    trackedFrom: "2020-01-01",
    ...partial,
  };
}

function employee(partial: Partial<Employee>): Employee {
  return {
    id: "MHG-1",
    name: "Test",
    role: "Staff Nurse",
    department: "Nursing",
    siteId: "barsha",
    nationality: "India",
    gender: "Female",
    hireDate: "2025-01-15",
    exitDate: null,
    exitType: null,
    exitReason: null,
    status: "Active",
    salaryBand: "B2",
    managerId: null,
    managerName: null,
    isManager: false,
    tenureYears: 1,
    source: null,
    ...partial,
  };
}

/* ---------- attrition ---------- */

describe("attritionRate", () => {
  it("annualises exits over average headcount", () => {
    // 12 exits on 100 average heads over 12 months = 12%
    expect(attritionRate(12, 100, 12)).toBeCloseTo(0.12);
    // the same 12 exits in 6 months annualises to 24%
    expect(attritionRate(12, 100, 6)).toBeCloseTo(0.24);
  });

  it("returns null when there is no headcount or no months", () => {
    expect(attritionRate(5, 0, 12)).toBeNull();
    expect(attritionRate(5, 100, 0)).toBeNull();
  });
});

describe("monthlyTotals / summarizeAttrition", () => {
  const snapshots = [
    snapshot({ month: "2026-01", headcountStart: 100, headcountEnd: 98, exitsVoluntary: 2 }),
    snapshot({ month: "2026-01", department: "Medical", headcountStart: 50, headcountEnd: 51, hires: 1 }),
    snapshot({ month: "2026-02", headcountStart: 98, headcountEnd: 96, exitsVoluntary: 1, exitsInvoluntary: 1 }),
    snapshot({ month: "2026-02", siteId: "nahda", headcountStart: 20, headcountEnd: 19, exitsVoluntary: 1 }),
  ];

  it("aggregates rows per month and zero-fills missing months", () => {
    const totals = monthlyTotals(snapshots, ALL_SCOPE, ["2026-01", "2026-02", "2026-03"]);
    expect(totals.map((t) => t.headcountEnd)).toEqual([149, 115, 0]);
    expect(totals[1]).toMatchObject({ exits: 3, exitsVoluntary: 2, exitsInvoluntary: 1 });
  });

  it("respects site and department scope", () => {
    const nursingBarsha = monthlyTotals(snapshots, { siteId: "barsha", department: "Nursing" }, ["2026-01", "2026-02"]);
    expect(nursingBarsha.map((t) => t.exits)).toEqual([2, 2]);
  });

  it("uses the mean of opening and closing headcount", () => {
    const totals = monthlyTotals(snapshots, { siteId: "barsha", department: "Nursing" }, ["2026-01", "2026-02"]);
    // (100+98)/2 = 99, (98+96)/2 = 97 -> 98
    expect(averageHeadcount(totals)).toBe(98);
    const s = summarizeAttrition(totals);
    expect(s.exits).toBe(4);
    expect(s.voluntary).toBe(3);
    expect(s.involuntary).toBe(1);
    expect(s.rate).toBeCloseTo((4 / 98) * 6);
  });

  it("rolling attrition needs a full window", () => {
    const totals: MonthTotals[] = Array.from({ length: 12 }, (_, i) => ({
      month: `2025-${String(i + 1).padStart(2, "0")}`,
      headcountStart: 100,
      headcountEnd: 100,
      hires: 1,
      exits: 1,
      exitsVoluntary: 1,
      exitsInvoluntary: 0,
    }));
    expect(rollingAttrition(totals, "2025-12")).toBeCloseTo(0.12);
    expect(rollingAttrition(totals, "2025-11")).toBeNull();
  });
});

describe("previousPeriod", () => {
  it("returns the same-length window immediately before", () => {
    expect(previousPeriod({ from: "2025-10", to: "2026-09" }, "2024-10")).toEqual({ from: "2024-10", to: "2025-09" });
    expect(previousPeriod({ from: "2026-07", to: "2026-09" }, "2024-10")).toEqual({ from: "2026-04", to: "2026-06" });
  });

  it("returns null when the comparison window has no data", () => {
    expect(previousPeriod({ from: "2024-10", to: "2026-09" }, "2024-10")).toBeNull();
  });
});

describe("first-year attrition", () => {
  const employees = [
    employee({ id: "1", hireDate: "2025-01-10", exitDate: "2025-06-01" }), // early leaver
    employee({ id: "2", hireDate: "2025-02-10", exitDate: "2026-05-01" }), // left after a year
    employee({ id: "3", hireDate: "2025-03-10" }),
    employee({ id: "4", hireDate: "2025-04-10", exitDate: "2025-09-01" }), // early leaver, Q2 cohort
  ];

  it("divides hires who left within 365 days by cohort hires", () => {
    const cohorts = firstYearAttritionByCohort(employees, { from: "2025-01", to: "2025-06" }, ALL_SCOPE, "2026-09-30");
    expect(cohorts[0]).toMatchObject({ quarter: "2025-Q1", hires: 3, leftWithinYear: 1, complete: true });
    expect(cohorts[0]!.rate).toBeCloseTo(1 / 3);
    expect(cohorts[1]).toMatchObject({ quarter: "2025-Q2", hires: 1, leftWithinYear: 1 });
  });

  it("flags cohorts that have not had a full year yet", () => {
    const cohorts = firstYearAttritionByCohort(employees, { from: "2025-01", to: "2025-03" }, ALL_SCOPE, "2025-12-31");
    expect(cohorts[0]!.complete).toBe(false);
  });

  it("measures the share of leavers who left in their first year", () => {
    const r = earlyExitShare(employees, { from: "2025-01", to: "2026-09" }, ALL_SCOPE);
    expect(r).toEqual({ early: 2, exits: 3, share: 2 / 3 });
  });
});

/* ---------- recruitment ---------- */

describe("time to hire", () => {
  const filled = req({
    openedAt: "2026-01-01",
    hire: { employeeId: "MHG-1", source: "Employee referral", appliedAt: "2026-01-05", acceptedAt: "2026-02-04", startDate: "2026-03-01" },
  });
  const filled2 = req({
    openedAt: "2026-02-01",
    hire: { employeeId: "MHG-2", source: "Job boards", appliedAt: "2026-02-03", acceptedAt: "2026-03-25", startDate: "2026-04-20" },
  });
  const open = req({ status: "Open", hire: null, offersMade: 0, offersAccepted: 0 });

  it("counts calendar days from application to offer acceptance", () => {
    expect(timeToHireDays(filled)).toBe(30);
    expect(timeToHireDays(open)).toBeNull();
  });

  it("time to fill runs from requisition opening", () => {
    expect(timeToFillDays(filled)).toBe(34);
  });

  it("averages only filled requisitions", () => {
    expect(averageTimeToHire([filled, filled2, open])).toBe(40);
    expect(averageTimeToHire([open])).toBeNull();
  });

  it("selects hires by offer-acceptance month", () => {
    expect(hiresInPeriod([filled, filled2, open], { from: "2026-03", to: "2026-03" }, ALL_SCOPE)).toEqual([filled2]);
  });

  it("computes offer acceptance across requisitions", () => {
    expect(offerAcceptanceRate([req({ offersMade: 2, offersAccepted: 1 }), req({ offersMade: 2, offersAccepted: 2 })])).toBe(0.75);
  });
});

describe("funnel and sources", () => {
  const reqs = [
    req({
      funnel: { "Employee referral": [10, 6, 4, 2, 1], "Job boards": [40, 10, 3, 1, 0] },
      hire: { employeeId: "x", source: "Employee referral", appliedAt: "2026-01-01", acceptedAt: "2026-01-21", startDate: "2026-02-15" },
    }),
    req({
      funnel: { "Job boards": [60, 12, 4, 1, 1] },
      hire: { employeeId: "y", source: "Job boards", appliedAt: "2026-01-01", acceptedAt: "2026-02-10", startDate: "2026-03-15" },
    }),
  ];

  it("sums stage counts across requisitions and sources", () => {
    expect(funnelTotals(reqs)).toEqual([110, 28, 11, 4, 2]);
    expect(funnelTotals(reqs, "Job boards")).toEqual([100, 22, 7, 2, 1]);
  });

  it("computes step and overall conversion", () => {
    const c = stageConversion([100, 50, 20, 5, 4]);
    expect(c[1]!.stepRate).toBe(0.5);
    expect(c[4]!.stepRate).toBe(0.8);
    expect(c[4]!.overallRate).toBe(0.04);
  });

  it("ranks sources by applicant-to-hire conversion", () => {
    const stats = sourceEffectiveness(reqs);
    expect(stats[0]!.source).toBe("Employee referral");
    expect(stats[0]!.conversion).toBe(0.1);
    const jb = stats.find((s) => s.source === "Job boards")!;
    expect(jb.conversion).toBe(0.01);
    expect(jb.avgTimeToHire).toBe(40);
    expect(jb.shareOfHires).toBe(0.5);
  });
});

/* ---------- compliance ---------- */

describe("expiryBucket", () => {
  const on = "2026-09-30";
  it.each([
    ["2026-09-29", "Overdue"],
    ["2026-09-30", "Due ≤ 30 days"],
    ["2026-10-30", "Due ≤ 30 days"],
    ["2026-10-31", "Due 31–60 days"],
    ["2026-11-29", "Due 31–60 days"],
    ["2026-11-30", "Due 61–90 days"],
    ["2026-12-29", "Due 61–90 days"],
    ["2026-12-30", "Valid > 90 days"],
  ] as const)("%s -> %s", (expiry, bucket) => {
    expect(expiryBucket(expiry, on)).toBe(bucket);
  });
});

describe("compliance at risk", () => {
  const renewedEarly = credential({ expiryDate: "2027-10-10", previousExpiryDate: "2026-10-10", renewedOn: "2026-09-01" });
  const notRenewed = credential({ expiryDate: "2026-10-15", previousExpiryDate: "2025-10-15", renewedOn: "2025-09-20" });
  const lapsed = credential({ expiryDate: "2026-09-10", previousExpiryDate: "2025-09-10", renewedOn: "2025-08-20" });
  const newJoiner = credential({ trackedFrom: "2026-09-15", renewedOn: "2026-09-01", expiryDate: "2027-09-01", previousExpiryDate: "2026-09-01" });

  it("uses the renewal history to know which expiry applied on a date", () => {
    expect(expiryOn(renewedEarly, "2026-09-30")).toBe("2027-10-10");
    expect(expiryOn(renewedEarly, "2026-08-31")).toBe("2026-10-10");
    expect(expiryOn(newJoiner, "2026-09-01")).toBeNull();
  });

  it("counts overdue and <=30-day items without a renewal", () => {
    expect(atRiskCount([renewedEarly, notRenewed, lapsed, newJoiner], "2026-09-30")).toBe(2);
    // A month earlier only the lapsed item was inside its 30-day window.
    expect(atRiskCount([renewedEarly, notRenewed, lapsed, newJoiner], "2026-08-31")).toBe(1);
  });

  it("buckets items as at a date", () => {
    const counts = bucketCounts([renewedEarly, notRenewed, lapsed], "2026-09-30");
    expect(counts["Overdue"]).toBe(1);
    expect(counts["Due ≤ 30 days"]).toBe(1);
    expect(counts["Valid > 90 days"]).toBe(1);
  });
});

/* ---------- onboarding ---------- */

describe("onboarding", () => {
  const record = (startDate: string, tasks: OnboardingRecord["tasks"]): OnboardingRecord => ({
    employeeId: "MHG-1",
    name: "Test",
    role: "Staff Nurse",
    department: "Nursing",
    siteId: "barsha",
    startDate,
    tasks,
  });

  it("derives task status on a date", () => {
    expect(taskStatus({ item: "Biometric access", dueDate: "2026-09-10", completedAt: "2026-09-08" }, "2026-09-30")).toBe("Done");
    expect(taskStatus({ item: "Biometric access", dueDate: "2026-09-10", completedAt: null }, "2026-09-30")).toBe("Overdue");
    expect(taskStatus({ item: "Biometric access", dueDate: "2026-10-05", completedAt: null }, "2026-09-30")).toBe("Due soon");
    expect(taskStatus({ item: "Biometric access", dueDate: "2026-10-25", completedAt: null }, "2026-09-30")).toBe("Pending");
    // Completed after the reporting date counts as not done yet.
    expect(taskStatus({ item: "Biometric access", dueDate: "2026-09-10", completedAt: "2026-10-02" }, "2026-09-30")).toBe("Overdue");
  });

  it("computes completion for joiners in the trailing window", () => {
    const records = [
      record("2026-09-01", [
        { item: "Documents & visa", dueDate: "2026-09-06", completedAt: "2026-09-02" },
        { item: "Biometric access", dueDate: "2026-09-03", completedAt: null },
      ]),
      record("2026-08-15", [
        { item: "Documents & visa", dueDate: "2026-08-20", completedAt: "2026-08-18" },
        { item: "Biometric access", dueDate: "2026-08-17", completedAt: "2026-08-16" },
      ]),
      record("2026-01-01", [{ item: "Documents & visa", dueDate: "2026-01-06", completedAt: null }]), // outside window
    ];
    const s = onboardingCompletion(records, "2026-09-30", 90);
    expect(s).toMatchObject({ joiners: 2, tasks: 4, completed: 3, overdue: 1 });
    expect(s.rate).toBe(0.75);
  });
});

/* ---------- engagement ---------- */

describe("engagement", () => {
  it("computes eNPS as % promoters minus % detractors", () => {
    expect(enps(50, 30, 20)).toBe(30);
    expect(enps(10, 20, 70)).toBe(-60);
    expect(enps(0, 0, 0)).toBeNull();
  });

  it("weights pulse scores by responses", () => {
    const rows: PulseResult[] = [
      { quarter: "2026-Q3", siteId: "a", department: "Nursing", invited: 100, responses: 80, score: 70, promoters: 30, passives: 30, detractors: 20 },
      { quarter: "2026-Q3", siteId: "b", department: "Nursing", invited: 25, responses: 20, score: 50, promoters: 2, passives: 8, detractors: 10 },
    ];
    const s = summarizePulse(rows);
    expect(s.score).toBe(66);
    expect(s.responseRate).toBe(0.8);
    expect(s.enps).toBe(2);
  });

  it("computes 1-on-1 coverage across managers", () => {
    const logs: CheckInLog[] = [
      { month: "2026-09", siteId: "a", department: "Nursing", managerId: "m1", managerName: "M1", reports: 10, reportsWithCheckIn: 8, checkIns: 9 },
      { month: "2026-09", siteId: "b", department: "Nursing", managerId: "m2", managerName: "M2", reports: 30, reportsWithCheckIn: 12, checkIns: 12 },
    ];
    expect(checkInCoverage(logs)).toBe(0.5);
    expect(checkInCoverage([])).toBeNull();
  });
});
