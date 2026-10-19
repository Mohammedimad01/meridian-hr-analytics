/**
 * Shared types for the synthetic Meridian Health Group dataset.
 * All dates are ISO calendar dates (yyyy-MM-dd); months are yyyy-MM.
 */

export const DEPARTMENTS = [
  "Nursing",
  "Medical",
  "Allied Health",
  "Front Office",
  "Admin",
  "Finance",
  "HR",
] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const CLINICAL_DEPARTMENTS: readonly Department[] = [
  "Nursing",
  "Medical",
  "Allied Health",
];

export type Emirate = "Dubai" | "Sharjah" | "Abu Dhabi";
export type Regulator = "DHA" | "DOH" | "MOHAP";

export interface Site {
  id: string;
  name: string;
  short: string;
  emirate: Emirate;
  type: "Hospital" | "Clinic";
  regulator: Regulator;
}

export type Gender = "Female" | "Male";
export type EmployeeStatus =
  | "Active"
  | "Probation"
  | "On leave"
  | "Notice period"
  | "Exited";
export type ExitType = "Voluntary" | "Involuntary";

export const SALARY_BANDS = ["B1", "B2", "B3", "B4", "B5", "B6"] as const;
export type SalaryBand = (typeof SALARY_BANDS)[number];

export const SOURCES = [
  "Employee referral",
  "Job boards",
  "LinkedIn",
  "Recruitment agency",
  "Careers site",
] as const;
export type Source = (typeof SOURCES)[number];

export interface Employee {
  id: string;
  name: string;
  role: string;
  department: Department;
  siteId: string;
  nationality: string;
  gender: Gender;
  hireDate: string;
  exitDate: string | null;
  exitType: ExitType | null;
  exitReason: string | null;
  status: EmployeeStatus;
  salaryBand: SalaryBand;
  managerId: string | null;
  managerName: string | null;
  isManager: boolean;
  /** Tenure in years at the data as-of date, or at exit for leavers. */
  tenureYears: number;
  /** Hiring source; null for staff hired before the reporting window. */
  source: Source | null;
}

/** One row per month x site x department. */
export interface MonthlySnapshot {
  month: string;
  siteId: string;
  department: Department;
  headcountStart: number;
  headcountEnd: number;
  hires: number;
  exitsVoluntary: number;
  exitsInvoluntary: number;
  exitReasons: Record<string, number>;
}

export const PIPELINE_STAGES = [
  "Applied",
  "Screened",
  "Interviewed",
  "Offered",
  "Hired",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export type RequisitionStatus = "Open" | "Filled" | "On hold" | "Cancelled";

/** Candidate counts reaching each stage, indexed like PIPELINE_STAGES. */
export type StageCounts = [number, number, number, number, number];

export interface Requisition {
  id: string;
  title: string;
  department: Department;
  siteId: string;
  hiringManager: string;
  recruiter: string;
  priority: "High" | "Normal";
  status: RequisitionStatus;
  openedAt: string;
  /** Milestone timestamps: first candidate reaching each stage. */
  stages: {
    screenedAt: string | null;
    interviewedAt: string | null;
    offeredAt: string | null;
    filledAt: string | null;
  };
  closedAt: string | null;
  funnel: Partial<Record<Source, StageCounts>>;
  offersMade: number;
  offersAccepted: number;
  /** employeeId is null when the offer is accepted but the joiner has not started yet. */
  hire: {
    employeeId: string | null;
    source: Source;
    appliedAt: string;
    acceptedAt: string;
    startDate: string;
  } | null;
}

export const ONBOARDING_ITEMS = [
  "Documents & visa",
  "Biometric access",
  "Medical insurance",
  "Malpractice insurance",
  "Licence activation",
] as const;
export type OnboardingItem = (typeof ONBOARDING_ITEMS)[number];

export interface OnboardingTask {
  item: OnboardingItem;
  dueDate: string;
  completedAt: string | null;
}

export interface OnboardingRecord {
  employeeId: string;
  name: string;
  role: string;
  department: Department;
  siteId: string;
  startDate: string;
  tasks: OnboardingTask[];
}

export type CredentialType = "Medical licence" | "Malpractice insurance";

export interface Credential {
  id: string;
  employeeId: string;
  name: string;
  role: string;
  department: Department;
  siteId: string;
  type: CredentialType;
  issuer: string;
  /** Current validity end. In the past means expired and not yet renewed. */
  expiryDate: string;
  /** Validity end of the previous cycle. */
  previousExpiryDate: string;
  /** When the current validity period was obtained. */
  renewedOn: string;
  /** The holder's start date; the item is only tracked from this date. */
  trackedFrom: string;
}

export type IloeStatus = "Registered" | "Pending" | "Not registered";

export interface IloeRecord {
  employeeId: string;
  siteId: string;
  department: Department;
  status: IloeStatus;
  registeredOn: string | null;
}

export interface ComplianceData {
  credentials: Credential[];
  iloe: IloeRecord[];
}

export interface PulseResult {
  quarter: string;
  siteId: string;
  department: Department;
  invited: number;
  responses: number;
  /** Mean engagement score, 0-100. */
  score: number;
  promoters: number;
  passives: number;
  detractors: number;
}

/** Monthly 1-on-1 check-in log, summarised per manager. */
export interface CheckInLog {
  month: string;
  siteId: string;
  department: Department;
  managerId: string;
  managerName: string;
  /** Direct reports employed during the month. */
  reports: number;
  /** Direct reports with at least one logged 1-on-1. */
  reportsWithCheckIn: number;
  checkIns: number;
}

export interface EngagementData {
  pulse: PulseResult[];
  checkIns: CheckInLog[];
}

export interface DatasetMeta {
  organisation: string;
  asOf: string;
  firstMonth: string;
  lastMonth: string;
  seed: number;
  generatedAt: string;
  sites: Site[];
}
