/**
 * Generates the synthetic Meridian Health Group dataset into /data.
 *
 *   npm run generate-data
 *
 * Everything is driven by a single seeded faker instance, so the output is
 * reproducible. The model is a month-by-month workforce simulation: people
 * leave according to department, site, tenure and seasonal hazards; each exit
 * (and each growth role) opens a requisition whose simulated pipeline produces
 * the replacement hire. Snapshots, onboarding, compliance and engagement data
 * are all derived from that one simulated population so the files agree.
 *
 * Patterns deliberately built in (and surfaced by the dashboard):
 *  - Nursing attrition runs at roughly 2x the rest of the workforce.
 *  - Voluntary exits spike in June-August (contract ends, school year, relocation).
 *  - Al Nahda clinic (Sharjah) trails every other site on engagement, 1-on-1
 *    coverage and retention, and its gap widens over time.
 *  - Employee referrals convert applicants to hires far better than job boards
 *    and fill roles faster.
 */
import { faker } from "@faker-js/faker";
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  getDaysInMonth,
  parseISO,
} from "date-fns";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { AS_OF, FIRST_MONTH, LAST_MONTH, ORGANISATION, SITES } from "../lib/org";
import {
  CLINICAL_DEPARTMENTS,
  DEPARTMENTS,
  type CheckInLog,
  type Credential,
  type DatasetMeta,
  type Department,
  type Employee,
  type EmployeeStatus,
  type ExitType,
  type Gender,
  type IloeRecord,
  type MonthlySnapshot,
  type OnboardingItem,
  type OnboardingRecord,
  type PulseResult,
  type Requisition,
  type SalaryBand,
  type Source,
  type StageCounts,
} from "../lib/types";

const SEED = Number(process.env.SEED ?? 202);
faker.seed(SEED);

/* ------------------------------------------------------------------ */
/* Random helpers                                                      */
/* ------------------------------------------------------------------ */

const rand = () => faker.number.float({ min: 0, max: 1 });
const between = (a: number, b: number) => a + rand() * (b - a);
const intBetween = (a: number, b: number) => faker.number.int({ min: a, max: b });
const chance = (p: number) => rand() < p;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function normal(mean = 0, sd = 1): number {
  const u = Math.max(rand(), 1e-9);
  const v = rand();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function poisson(lambda: number): number {
  const l = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > l);
  return k - 1;
}

function binomial(n: number, p: number): number {
  let x = 0;
  for (let i = 0; i < n; i++) if (rand() < p) x++;
  return x;
}

function weighted<T>(entries: ReadonlyArray<readonly [T, number]>): T {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [value, w] of entries) {
    r -= w;
    if (r <= 0) return value;
  }
  return entries[entries.length - 1]![0];
}

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const monthKey = (d: Date) => format(d, "yyyy-MM");
const asOf = parseISO(AS_OF);
const firstMonth = parseISO(`${FIRST_MONTH}-01`);
const MONTHS = Array.from({ length: 24 }, (_, i) => addMonths(firstMonth, i));

function randomDayInMonth(monthStart: Date): Date {
  return addDays(monthStart, intBetween(0, getDaysInMonth(monthStart) - 1));
}

/* ------------------------------------------------------------------ */
/* Organisation model                                                  */
/* ------------------------------------------------------------------ */

const START_HEADCOUNT: Record<string, number> = {
  barsha: 604,
  jumeirah: 66,
  mirdif: 64,
  marina: 58,
  nahda: 64,
  majaz: 56,
  muwaileh: 52,
  khalifa: 66,
  reem: 54,
};

/** Share of growth hiring each site receives. */
const GROWTH_WEIGHT: Record<string, number> = {
  barsha: 0.44,
  reem: 0.13,
  khalifa: 0.1,
  marina: 0.08,
  jumeirah: 0.05,
  mirdif: 0.05,
  nahda: 0.05,
  majaz: 0.05,
  muwaileh: 0.05,
};
const GROWTH_REQS_PER_MONTH = 6.2;

const HOSPITAL_MIX: Record<Department, number> = {
  Nursing: 0.42, Medical: 0.14, "Allied Health": 0.16, "Front Office": 0.09, Admin: 0.11, Finance: 0.05, HR: 0.03,
};
const CLINIC_MIX: Record<Department, number> = {
  Nursing: 0.3, Medical: 0.24, "Allied Health": 0.17, "Front Office": 0.19, Admin: 0.065, Finance: 0.02, HR: 0.015,
};

/** Annual voluntary attrition before tenure, site and seasonal effects. */
const VOLUNTARY_RATE: Record<Department, number> = {
  Nursing: 0.25, Medical: 0.06, "Allied Health": 0.1, "Front Office": 0.12, Admin: 0.08, Finance: 0.06, HR: 0.07,
};
const INVOLUNTARY_RATE = 0.028;

/** Jan..Dec multipliers on voluntary exits (mean 1.0). */
const SEASONALITY = [0.85, 0.78, 0.84, 0.9, 0.96, 1.6, 2.0, 1.75, 0.95, 0.62, 0.56, 0.6];

const SITE_ATTRITION: Record<string, number> = {
  barsha: 1, jumeirah: 0.95, mirdif: 1, marina: 0.95, nahda: 2.0, majaz: 1, muwaileh: 1.05, khalifa: 0.85, reem: 0.95,
};

interface RoleDef {
  role: string;
  weight: number;
  bands: SalaryBand[];
}

const ROLES: Record<Department, RoleDef[]> = {
  Nursing: [
    { role: "Staff Nurse", weight: 55, bands: ["B2", "B3"] },
    { role: "Senior Staff Nurse", weight: 16, bands: ["B3"] },
    { role: "Charge Nurse", weight: 7, bands: ["B3", "B4"] },
    { role: "Nursing Assistant", weight: 14, bands: ["B1"] },
    { role: "Midwife", weight: 6, bands: ["B3"] },
    { role: "Nurse Educator", weight: 2, bands: ["B4"] },
  ],
  Medical: [
    { role: "General Practitioner", weight: 30, bands: ["B4"] },
    { role: "Specialist, Internal Medicine", weight: 10, bands: ["B5"] },
    { role: "Specialist, Paediatrics", weight: 10, bands: ["B5"] },
    { role: "Specialist, Obstetrics & Gynaecology", weight: 9, bands: ["B5"] },
    { role: "Specialist, Dermatology", weight: 6, bands: ["B5"] },
    { role: "Specialist, Radiology", weight: 5, bands: ["B5"] },
    { role: "Specialist, ENT", weight: 4, bands: ["B5"] },
    { role: "Emergency Physician", weight: 6, bands: ["B5"] },
    { role: "Consultant, Cardiology", weight: 4, bands: ["B6"] },
    { role: "Consultant, Orthopaedics", weight: 4, bands: ["B6"] },
    { role: "Dentist", weight: 12, bands: ["B4", "B5"] },
  ],
  "Allied Health": [
    { role: "Pharmacist", weight: 20, bands: ["B3"] },
    { role: "Pharmacy Technician", weight: 14, bands: ["B2"] },
    { role: "Physiotherapist", weight: 16, bands: ["B3"] },
    { role: "Radiographer", weight: 14, bands: ["B3"] },
    { role: "Lab Technologist", weight: 18, bands: ["B2", "B3"] },
    { role: "Dietitian", weight: 6, bands: ["B3"] },
    { role: "Respiratory Therapist", weight: 6, bands: ["B3"] },
    { role: "Optometrist", weight: 6, bands: ["B3"] },
  ],
  "Front Office": [
    { role: "Receptionist", weight: 30, bands: ["B1", "B2"] },
    { role: "Patient Relations Officer", weight: 24, bands: ["B2"] },
    { role: "Insurance Coordinator", weight: 18, bands: ["B2"] },
    { role: "Call Centre Agent", weight: 16, bands: ["B1"] },
    { role: "Medical Records Clerk", weight: 12, bands: ["B1"] },
  ],
  Admin: [
    { role: "Administrative Assistant", weight: 30, bands: ["B2"] },
    { role: "Facilities Coordinator", weight: 14, bands: ["B2"] },
    { role: "IT Support Specialist", weight: 14, bands: ["B3"] },
    { role: "Housekeeping Supervisor", weight: 14, bands: ["B1", "B2"] },
    { role: "Procurement Officer", weight: 12, bands: ["B3"] },
    { role: "Quality Officer", weight: 10, bands: ["B3"] },
  ],
  Finance: [
    { role: "Billing Specialist", weight: 30, bands: ["B2"] },
    { role: "Accountant", weight: 25, bands: ["B3"] },
    { role: "Claims Analyst", weight: 25, bands: ["B2"] },
    { role: "Revenue Cycle Analyst", weight: 15, bands: ["B3"] },
    { role: "Cashier", weight: 15, bands: ["B1"] },
  ],
  HR: [
    { role: "HR Generalist", weight: 25, bands: ["B3"] },
    { role: "Recruitment Specialist", weight: 20, bands: ["B3"] },
    { role: "HR Coordinator", weight: 20, bands: ["B2"] },
    { role: "Payroll Specialist", weight: 15, bands: ["B3"] },
    { role: "Government Relations Officer", weight: 15, bands: ["B2"] },
    { role: "Learning & Development Specialist", weight: 10, bands: ["B3"] },
  ],
};

const LEAD_ROLE: Record<Department, { hospital: [string, SalaryBand]; clinic: [string, SalaryBand] }> = {
  Nursing: { hospital: ["Director of Nursing", "B5"], clinic: ["Nurse Manager", "B4"] },
  Medical: { hospital: ["Medical Director", "B6"], clinic: ["Clinic Medical Lead", "B5"] },
  "Allied Health": { hospital: ["Allied Health Manager", "B4"], clinic: ["Allied Health Lead", "B4"] },
  "Front Office": { hospital: ["Patient Services Manager", "B4"], clinic: ["Front Office Supervisor", "B3"] },
  Admin: { hospital: ["Hospital Operations Director", "B5"], clinic: ["Clinic Operations Manager", "B4"] },
  Finance: { hospital: ["Finance Manager", "B5"], clinic: ["Finance Manager", "B5"] },
  HR: { hospital: ["Head of HR", "B5"], clinic: ["Head of HR", "B5"] },
};

const NATIONALITY_MIX: Record<Department, ReadonlyArray<readonly [string, number]>> = {
  Nursing: [["India", 40], ["Philippines", 34], ["Egypt", 5], ["Jordan", 4], ["Pakistan", 3], ["Kenya", 4], ["Nigeria", 2], ["Sri Lanka", 3], ["Nepal", 2], ["UAE", 1], ["Lebanon", 1], ["Syria", 1]],
  Medical: [["Egypt", 18], ["India", 20], ["Pakistan", 10], ["Jordan", 9], ["Syria", 8], ["Lebanon", 5], ["United Kingdom", 7], ["South Africa", 3], ["UAE", 6], ["Sudan", 6], ["Iraq", 4], ["Philippines", 2], ["Ireland", 2]],
  "Allied Health": [["India", 30], ["Philippines", 25], ["Egypt", 10], ["Jordan", 7], ["Pakistan", 6], ["Lebanon", 4], ["Sri Lanka", 4], ["UAE", 4], ["Syria", 4], ["Kenya", 3], ["United Kingdom", 3]],
  "Front Office": [["Philippines", 32], ["India", 22], ["UAE", 14], ["Egypt", 6], ["Jordan", 5], ["Pakistan", 5], ["Lebanon", 4], ["Sri Lanka", 5], ["Nepal", 4], ["Syria", 3]],
  Admin: [["India", 30], ["Philippines", 20], ["Pakistan", 10], ["Egypt", 8], ["UAE", 8], ["Jordan", 6], ["Sri Lanka", 6], ["Nepal", 6], ["Lebanon", 3], ["Syria", 3]],
  Finance: [["India", 42], ["Pakistan", 15], ["Philippines", 12], ["Egypt", 10], ["Jordan", 8], ["Lebanon", 5], ["UAE", 5], ["Sri Lanka", 3]],
  HR: [["UAE", 22], ["India", 22], ["Philippines", 15], ["Egypt", 10], ["Jordan", 10], ["Lebanon", 8], ["Pakistan", 6], ["United Kingdom", 4], ["Syria", 3]],
};

const FEMALE_SHARE: Record<Department, number> = {
  Nursing: 0.88, Medical: 0.42, "Allied Health": 0.58, "Front Office": 0.62, Admin: 0.4, Finance: 0.45, HR: 0.68,
};

/* ------------------------------------------------------------------ */
/* Names (curated per region so names match nationality)               */
/* ------------------------------------------------------------------ */

type NameGroup = "indian" | "filipino" | "arab" | "emirati" | "pakistani" | "western" | "african" | "southAsian";

const NAMES: Record<NameGroup, { female: string[]; male: string[]; last: string[] }> = {
  indian: {
    female: ["Priya", "Anjali", "Deepa", "Lakshmi", "Sneha", "Divya", "Meera", "Anita", "Kavya", "Reshma", "Sreeja", "Neha", "Pooja", "Asha", "Bindu", "Jincy", "Ancy", "Sherin", "Nisha", "Rekha", "Aswathy", "Soumya", "Linta", "Remya"],
    male: ["Rahul", "Arjun", "Vikram", "Suresh", "Rajesh", "Anil", "Deepak", "Arun", "Nikhil", "Sanjay", "Vivek", "Joseph", "Jithin", "Manoj", "Ravi", "Karthik", "Prakash", "Sebin", "Akhil"],
    last: ["Nair", "Menon", "Pillai", "Kumar", "Sharma", "Varghese", "Thomas", "Mathew", "Joseph", "Iyer", "Reddy", "Patel", "Gupta", "Das", "Krishnan", "Kurian", "George", "Rao", "Shetty", "Fernandes", "D'Souza", "Philip", "Chacko"],
  },
  filipino: {
    female: ["Maria", "Kristine", "Joy", "Mary Grace", "Jocelyn", "Rowena", "Lovely", "Jennifer", "Cherry", "Rhea", "Angelica", "Mae", "Liezl", "Ruby", "Divine", "Camille", "Janine", "Aileen"],
    male: ["Jose", "Mark", "John Paul", "Ronald", "Christian", "Romeo", "Jerome", "Rey", "Dennis", "Arnel", "Marvin", "Jayson", "Carlo"],
    last: ["Santos", "Reyes", "Cruz", "Bautista", "Garcia", "Mendoza", "Dela Cruz", "Ramos", "Villanueva", "Aquino", "Castillo", "Fernandez", "Flores", "Navarro", "Torres", "Gonzales", "Domingo", "Manalo", "Pascual", "Soriano"],
  },
  arab: {
    female: ["Fatima", "Mariam", "Aisha", "Noura", "Huda", "Rania", "Layla", "Salma", "Dina", "Reem", "Hala", "Yasmin", "Lina", "Sara", "Amal", "Mona", "Nadia", "Rasha", "Heba", "Dalia", "Ruba", "Lama"],
    male: ["Ahmed", "Mohammed", "Omar", "Khaled", "Yousef", "Hassan", "Ali", "Tariq", "Karim", "Samir", "Faisal", "Mahmoud", "Mostafa", "Nabil", "Walid", "Ziad", "Hani", "Bassam", "Amr"],
    last: ["Haddad", "Khalil", "Nasser", "Saleh", "Abdallah", "Mansour", "Farouk", "Hamdan", "El Sayed", "Ibrahim", "Youssef", "Darwish", "Barakat", "Aziz", "Qasim", "Abu Zaid", "Shaheen", "Kassem", "Hijazi", "Othman", "Fathy", "Mahdi"],
  },
  emirati: {
    female: ["Shaikha", "Hessa", "Maitha", "Alia", "Fatima", "Mariam", "Moza", "Amna", "Latifa", "Noura", "Reem", "Afra"],
    male: ["Rashid", "Hamad", "Saeed", "Majid", "Sultan", "Khalifa", "Mohammed", "Ahmed", "Abdulla", "Saif", "Obaid", "Humaid"],
    last: ["Al Mansoori", "Al Zaabi", "Al Shamsi", "Al Ketbi", "Al Nuaimi", "Al Hashimi", "Al Suwaidi", "Al Falasi", "Al Mazrouei", "Al Dhaheri", "Al Mehairi"],
  },
  pakistani: {
    female: ["Ayesha", "Sana", "Hina", "Fariha", "Zainab", "Mahnoor", "Sadia", "Rabia", "Amna", "Iqra", "Saima"],
    male: ["Imran", "Usman", "Bilal", "Hamza", "Faisal", "Asad", "Kamran", "Adnan", "Waqas", "Zeeshan", "Shahid", "Irfan"],
    last: ["Khan", "Malik", "Qureshi", "Siddiqui", "Butt", "Chaudhry", "Sheikh", "Raza", "Hussain", "Iqbal", "Mirza", "Abbasi"],
  },
  western: {
    female: ["Sarah", "Emma", "Laura", "Rachel", "Claire", "Hannah", "Sophie", "Charlotte", "Megan", "Rebecca", "Lauren", "Niamh"],
    male: ["James", "Daniel", "Michael", "Thomas", "David", "Andrew", "Christopher", "Matthew", "Ryan", "Peter", "Simon", "Conor"],
    last: ["Smith", "Taylor", "Brown", "Wilson", "Evans", "Walker", "Roberts", "Clarke", "Hughes", "Edwards", "Murphy", "O'Brien", "van der Merwe", "Botha", "Kelly"],
  },
  african: {
    female: ["Grace", "Faith", "Mercy", "Esther", "Chioma", "Ngozi", "Wanjiru", "Akinyi", "Blessing", "Achieng", "Amara"],
    male: ["Brian", "Kevin", "Emmanuel", "Chinedu", "Samuel", "Otieno", "Kamau", "Tunde", "Kelvin", "Obinna"],
    last: ["Odhiambo", "Mwangi", "Otieno", "Wanjiku", "Okafor", "Adeyemi", "Okonkwo", "Eze", "Nwosu", "Mutua", "Kiprop", "Njoroge"],
  },
  southAsian: {
    female: ["Nadeesha", "Dilini", "Sita", "Anjana", "Kumari", "Sabina", "Tharushi", "Nirmala", "Pabitra"],
    male: ["Kasun", "Ruwan", "Nuwan", "Bikash", "Suman", "Prakash", "Chaminda", "Ramesh", "Dinesh"],
    last: ["Perera", "Fernando", "Silva", "Jayasinghe", "Gurung", "Thapa", "Shrestha", "Rai", "Bandara", "Wickramasinghe"],
  },
};

const NAME_GROUP: Record<string, NameGroup> = {
  India: "indian", Philippines: "filipino", Egypt: "arab", Jordan: "arab", Syria: "arab", Lebanon: "arab", Sudan: "arab", Iraq: "arab",
  UAE: "emirati", Pakistan: "pakistani", "United Kingdom": "western", Ireland: "western", "South Africa": "western",
  Kenya: "african", Nigeria: "african", "Sri Lanka": "southAsian", Nepal: "southAsian",
};

const usedNames = new Set<string>();
function personName(nationality: string, gender: Gender): string {
  const group = NAMES[NAME_GROUP[nationality] ?? "western"];
  for (let i = 0; i < 20; i++) {
    const first = faker.helpers.arrayElement(gender === "Female" ? group.female : group.male);
    const last = faker.helpers.arrayElement(group.last);
    const name = `${first} ${last}`;
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
  }
  // Fall back to a middle initial for very common combinations.
  const first = faker.helpers.arrayElement(gender === "Female" ? group.female : group.male);
  const name = `${first} ${faker.string.alpha({ casing: "upper", length: 1 })}. ${faker.helpers.arrayElement(group.last)}`;
  usedNames.add(name);
  return name;
}

/* ------------------------------------------------------------------ */
/* Simulation state                                                    */
/* ------------------------------------------------------------------ */

interface Person {
  id: string;
  name: string;
  role: string;
  department: Department;
  siteId: string;
  nationality: string;
  gender: Gender;
  salaryBand: SalaryBand;
  hireDate: Date;
  exitDate: Date | null;
  exitType: ExitType | null;
  exitReason: string | null;
  isLead: boolean;
  manager: Person | null;
  source: Source | null;
  retentionFactor: number;
}

const people: Person[] = [];
const leads = new Map<string, Person>();
const leadKey = (siteId: string, dept: Department) => `${siteId}:${dept}`;
const isHospital = (siteId: string) => siteId === "barsha";
const hasLocalLead = (siteId: string, dept: Department) =>
  isHospital(siteId) || (dept !== "Finance" && dept !== "HR");

function managerFor(siteId: string, dept: Department): Person {
  const key = hasLocalLead(siteId, dept) ? leadKey(siteId, dept) : leadKey("barsha", dept);
  const lead = leads.get(key);
  if (!lead) throw new Error(`No lead for ${key}`);
  return lead;
}

function pickRole(dept: Department): RoleDef {
  return weighted(ROLES[dept].map((r) => [r, r.weight] as const));
}

function createPerson(opts: {
  siteId: string;
  department: Department;
  hireDate: Date;
  role?: string;
  isLead?: boolean;
  source?: Source | null;
}): Person {
  const { siteId, department, hireDate } = opts;
  const nationality = weighted(NATIONALITY_MIX[department]);
  const gender: Gender = chance(FEMALE_SHARE[department]) ? "Female" : "Male";
  let role: string;
  let band: SalaryBand;
  if (opts.isLead) {
    const [r, b] = LEAD_ROLE[department][isHospital(siteId) ? "hospital" : "clinic"];
    role = r;
    band = b;
  } else {
    const def = opts.role
      ? ROLES[department].find((r) => r.role === opts.role) ?? pickRole(department)
      : pickRole(department);
    role = def.role;
    band = faker.helpers.arrayElement(def.bands);
  }
  const source = opts.source ?? null;
  const person: Person = {
    id: "",
    name: personName(nationality, gender),
    role,
    department,
    siteId,
    nationality,
    gender,
    salaryBand: band,
    hireDate,
    exitDate: null,
    exitType: null,
    exitReason: null,
    isLead: opts.isLead ?? false,
    manager: null,
    source,
    retentionFactor:
      source === "Employee referral" ? 0.55 : source === "Recruitment agency" ? 1.15 : 1,
  };
  people.push(person);
  return person;
}

function allocate(total: number, mix: Record<Department, number>): Record<Department, number> {
  const raw = DEPARTMENTS.map((d) => [d, total * mix[d]] as const);
  const out = Object.fromEntries(raw.map(([d, v]) => [d, Math.floor(v)])) as Record<Department, number>;
  let remaining = total - Object.values(out).reduce((a, b) => a + b, 0);
  const byRemainder = [...raw].sort((a, b) => (b[1] % 1) - (a[1] % 1));
  for (const [d] of byRemainder) {
    if (remaining-- <= 0) break;
    out[d]++;
  }
  return out;
}

/* ---------- Initial population at the start of the window ---------- */

for (const site of SITES) {
  const counts = allocate(START_HEADCOUNT[site.id]!, isHospital(site.id) ? HOSPITAL_MIX : CLINIC_MIX);
  for (const dept of DEPARTMENTS) {
    let n = counts[dept];
    if (hasLocalLead(site.id, dept) && n > 0) {
      const lead = createPerson({
        siteId: site.id,
        department: dept,
        hireDate: addDays(firstMonth, -Math.round(between(4, 12) * 365.25)),
        isLead: true,
      });
      leads.set(leadKey(site.id, dept), lead);
      n--;
    }
    for (let i = 0; i < n; i++) {
      const tenure = clamp(-Math.log(Math.max(rand(), 1e-6)) * 3, 0.03, 16);
      createPerson({
        siteId: site.id,
        department: dept,
        hireDate: addDays(firstMonth, -Math.round(tenure * 365.25)),
      });
    }
  }
}
for (const p of people) if (!p.isLead) p.manager = managerFor(p.siteId, p.department);

/* ------------------------------------------------------------------ */
/* Exit model                                                          */
/* ------------------------------------------------------------------ */

const VOLUNTARY_REASONS = [
  "Better pay elsewhere",
  "Career progression",
  "Relocation / returning home",
  "Workload & burnout",
  "Family reasons",
  "Manager relationship",
  "Further studies",
] as const;
const INVOLUNTARY_REASONS = [
  "Probation not passed",
  "Performance",
  "Contract not renewed",
  "Misconduct",
  "Restructuring",
] as const;

function tenureMultiplier(years: number): number {
  if (years < 1) return 1.55;
  if (years < 2) return 1.2;
  if (years < 5) return 0.95;
  return 0.6;
}

function voluntaryReason(p: Person, month: number): string {
  const summer = month >= 5 && month <= 7;
  const w: Record<string, number> = {
    "Better pay elsewhere": 24,
    "Career progression": 18,
    "Relocation / returning home": 15,
    "Workload & burnout": 11,
    "Family reasons": 10,
    "Manager relationship": 7,
    "Further studies": 6,
  };
  if (p.department === "Nursing") {
    w["Workload & burnout"]! *= 2.2;
    w["Better pay elsewhere"]! *= 1.3;
  }
  if (p.department === "Medical") w["Career progression"]! *= 1.6;
  if (summer) {
    w["Relocation / returning home"]! *= 2.3;
    w["Family reasons"]! *= 1.8;
  }
  if (p.siteId === "nahda") {
    w["Manager relationship"]! *= 4.5;
    w["Workload & burnout"]! *= 1.5;
  }
  return weighted(VOLUNTARY_REASONS.map((r) => [r, w[r]!] as const));
}

/* ------------------------------------------------------------------ */
/* Recruitment model                                                   */
/* ------------------------------------------------------------------ */

interface SourceModel {
  share: number; // share of applicant volume
  pass: [number, number, number]; // applied->screened, screened->interviewed, interviewed->offered
  accept: number; // offer acceptance
  speed: number; // multiplier on time-to-hire
}

const SOURCE_MODEL: Record<Source, SourceModel> = {
  "Employee referral": { share: 0.11, pass: [0.56, 0.6, 0.5], accept: 0.92, speed: 0.72 },
  "Job boards": { share: 0.43, pass: [0.24, 0.32, 0.35], accept: 0.72, speed: 1.14 },
  LinkedIn: { share: 0.2, pass: [0.33, 0.42, 0.4], accept: 0.8, speed: 1 },
  "Recruitment agency": { share: 0.1, pass: [0.5, 0.55, 0.45], accept: 0.8, speed: 0.92 },
  "Careers site": { share: 0.16, pass: [0.3, 0.4, 0.4], accept: 0.82, speed: 1.05 },
};
const SOURCE_LIST = Object.keys(SOURCE_MODEL) as Source[];
const hireYield = (s: Source) => {
  const m = SOURCE_MODEL[s];
  return m.share * m.pass[0] * m.pass[1] * m.pass[2] * m.accept;
};

const TIME_TO_HIRE_DAYS: Record<Department, number> = {
  Nursing: 34, Medical: 58, "Allied Health": 41, "Front Office": 22, Admin: 26, Finance: 31, HR: 29,
};
const APPLICANTS_PER_REQ: Record<Department, number> = {
  Nursing: 26, Medical: 10, "Allied Health": 17, "Front Office": 34, Admin: 24, Finance: 21, HR: 22,
};

interface DraftReq {
  department: Department;
  siteId: string;
  role: string;
  priority: "High" | "Normal";
  openedAt: Date;
  hireSource: Source;
  appliedAt: Date;
  acceptedAt: Date;
  startDate: Date;
  cancelAt: Date | null;
  applicants: number;
  employee: Person | null;
}

const drafts: DraftReq[] = [];
const pendingHires: DraftReq[] = [];

function openRequisition(siteId: string, department: Department, role: string, openedAt: Date, kind: "replacement" | "growth") {
  const hireSource = weighted(SOURCE_LIST.map((s) => [s, hireYield(s)] as const));
  const tth = clamp(
    Math.round(TIME_TO_HIRE_DAYS[department] * SOURCE_MODEL[hireSource].speed * Math.exp(normal(0, 0.28))),
    6,
    160,
  );
  const appliedAt = addDays(openedAt, intBetween(1, 10));
  const acceptedAt = addDays(appliedAt, tth);
  const clinical = CLINICAL_DEPARTMENTS.includes(department);
  const startDate = addDays(acceptedAt, clinical ? intBetween(25, 55) : intBetween(12, 35));
  const cancelled = chance(kind === "growth" ? 0.09 : 0.03);
  const draft: DraftReq = {
    department,
    siteId,
    role,
    priority: department === "Medical" || (department === "Nursing" && chance(0.4)) ? "High" : "Normal",
    openedAt,
    hireSource,
    appliedAt,
    acceptedAt,
    startDate,
    cancelAt: cancelled ? addDays(openedAt, intBetween(18, 80)) : null,
    applicants: Math.max(3, Math.round(APPLICANTS_PER_REQ[department] * between(0.6, 1.5))),
    employee: null,
  };
  drafts.push(draft);
  if (!cancelled) pendingHires.push(draft);
}

function openGrowthRequisitions(monthStart: Date) {
  const n = poisson(GROWTH_REQS_PER_MONTH);
  for (let i = 0; i < n; i++) {
    const siteId = weighted(Object.entries(GROWTH_WEIGHT));
    const mix = isHospital(siteId) ? HOSPITAL_MIX : CLINIC_MIX;
    const department = weighted(DEPARTMENTS.map((d) => [d, mix[d]] as const));
    openRequisition(siteId, department, pickRole(department).role, randomDayInMonth(monthStart), "growth");
  }
}

function monthlyHazards(p: Person, monthStart: Date) {
  const tenure = differenceInCalendarDays(monthStart, p.hireDate) / 365.25;
  const vol =
    (VOLUNTARY_RATE[p.department] / 12) *
    SEASONALITY[monthStart.getMonth()]! *
    SITE_ATTRITION[p.siteId]! *
    tenureMultiplier(tenure) *
    p.retentionFactor;
  const invol = (INVOLUNTARY_RATE / 12) * (tenure < 0.5 ? 3.5 : 1);
  return { vol, invol, tenure };
}

/* ---------- Warm-up: requisitions opened in the quarter before the window ---------- */

for (let w = 3; w >= 1; w--) {
  const monthStart = addMonths(firstMonth, -w);
  for (const p of people) {
    if (p.isLead) continue;
    const { vol, invol } = monthlyHazards(p, monthStart);
    if (chance(vol + invol) && chance(0.93)) {
      openRequisition(p.siteId, p.department, p.role, addDays(randomDayInMonth(monthStart), intBetween(-10, 5)), "replacement");
    }
  }
  openGrowthRequisitions(monthStart);
}

/* ---------- Main monthly simulation ---------- */

for (const monthStart of MONTHS) {
  const monthEnd = endOfMonth(monthStart);

  // 1. Joiners whose start date falls on or before this month end.
  for (let i = pendingHires.length - 1; i >= 0; i--) {
    const draft = pendingHires[i]!;
    if (draft.startDate > monthEnd || draft.startDate > asOf) continue;
    pendingHires.splice(i, 1);
    const person = createPerson({
      siteId: draft.siteId,
      department: draft.department,
      hireDate: draft.startDate,
      role: draft.role,
      source: draft.hireSource,
    });
    person.manager = managerFor(person.siteId, person.department);
    draft.employee = person;
  }

  // 2. Leavers.
  for (const p of people) {
    if (p.isLead || p.exitDate || p.hireDate >= monthStart) continue;
    const { vol, invol, tenure } = monthlyHazards(p, monthStart);
    const r = rand();
    if (r >= vol + invol) continue;
    const voluntary = r < vol;
    let exitDate = randomDayInMonth(monthStart);
    if (exitDate <= p.hireDate) exitDate = addDays(p.hireDate, 1);
    p.exitDate = exitDate;
    p.exitType = voluntary ? "Voluntary" : "Involuntary";
    p.exitReason = voluntary
      ? voluntaryReason(p, monthStart.getMonth())
      : tenure < 0.5
        ? weighted([["Probation not passed", 70], ["Performance", 15], ["Misconduct", 10], ["Contract not renewed", 5]] as const)
        : weighted(INVOLUNTARY_REASONS.filter((x) => x !== "Probation not passed").map((x) => [x, x === "Performance" ? 40 : x === "Contract not renewed" ? 30 : x === "Restructuring" ? 15 : 15] as const));
    if (chance(0.93)) {
      openRequisition(p.siteId, p.department, p.role, addDays(exitDate, intBetween(-25, 5)), "replacement");
    }
  }

  // 3. Growth roles.
  openGrowthRequisitions(monthStart);
}

/* ------------------------------------------------------------------ */
/* Finalise people                                                     */
/* ------------------------------------------------------------------ */

const startingCohort = people.filter((p) => p.hireDate < firstMonth).sort((a, b) => +a.hireDate - +b.hireDate);
const joiners = people.filter((p) => p.hireDate >= firstMonth).sort((a, b) => +a.hireDate - +b.hireDate);
[...startingCohort, ...joiners].forEach((p, i) => {
  p.id = `MHG-${10001 + i}`;
});

function statusOf(p: Person): EmployeeStatus {
  if (p.exitDate) return "Exited";
  const tenureDays = differenceInCalendarDays(asOf, p.hireDate);
  if (tenureDays < 183) return "Probation";
  if (!p.isLead && chance(0.022)) return "Notice period";
  if (chance(0.025)) return "On leave";
  return "Active";
}

const employees: Employee[] = [...startingCohort, ...joiners].map((p) => ({
  id: p.id,
  name: p.name,
  role: p.role,
  department: p.department,
  siteId: p.siteId,
  nationality: p.nationality,
  gender: p.gender,
  hireDate: iso(p.hireDate),
  exitDate: p.exitDate ? iso(p.exitDate) : null,
  exitType: p.exitType,
  exitReason: p.exitReason,
  status: statusOf(p),
  salaryBand: p.salaryBand,
  managerId: p.manager?.id ?? null,
  managerName: p.manager?.name ?? null,
  isManager: p.isLead,
  tenureYears: Math.round((differenceInCalendarDays(p.exitDate ?? asOf, p.hireDate) / 365.25) * 10) / 10,
  source: p.source,
}));

const isEmployedOn = (p: Person, day: Date) => p.hireDate <= day && (!p.exitDate || p.exitDate >= day);
const activeAtAsOf = people.filter((p) => !p.exitDate);

/* ------------------------------------------------------------------ */
/* Monthly snapshots                                                   */
/* ------------------------------------------------------------------ */

const snapshots: MonthlySnapshot[] = [];
for (const monthStart of MONTHS) {
  const monthEnd = endOfMonth(monthStart);
  for (const site of SITES) {
    for (const dept of DEPARTMENTS) {
      const group = people.filter((p) => p.siteId === site.id && p.department === dept);
      if (group.length === 0) continue;
      const row: MonthlySnapshot = {
        month: monthKey(monthStart),
        siteId: site.id,
        department: dept,
        headcountStart: 0,
        headcountEnd: 0,
        hires: 0,
        exitsVoluntary: 0,
        exitsInvoluntary: 0,
        exitReasons: {},
      };
      for (const p of group) {
        if (p.hireDate < monthStart && (!p.exitDate || p.exitDate >= monthStart)) row.headcountStart++;
        if (p.hireDate <= monthEnd && (!p.exitDate || p.exitDate > monthEnd)) row.headcountEnd++;
        if (p.hireDate >= monthStart && p.hireDate <= monthEnd) row.hires++;
        if (p.exitDate && p.exitDate >= monthStart && p.exitDate <= monthEnd) {
          if (p.exitType === "Voluntary") row.exitsVoluntary++;
          else row.exitsInvoluntary++;
          row.exitReasons[p.exitReason!] = (row.exitReasons[p.exitReason!] ?? 0) + 1;
        }
      }
      if (row.headcountStart + row.headcountEnd + row.hires === 0) continue;
      snapshots.push(row);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Requisitions                                                        */
/* ------------------------------------------------------------------ */

const recruiters = people
  .filter((p) => p.department === "HR" && !p.isLead && !p.exitDate && (p.role === "Recruitment Specialist" || p.role === "HR Generalist"))
  .slice(0, 4)
  .map((p) => p.name);
if (recruiters.length === 0) recruiters.push("Talent Acquisition");

function simulateFunnel(draft: DraftReq, cap: number, appliedFraction: number, filled: boolean) {
  const funnel: Partial<Record<Source, StageCounts>> = {};
  let declined = 0;
  const bump = (s: Source, stage: number) => {
    const row = (funnel[s] ??= [0, 0, 0, 0, 0]);
    for (let i = 0; i <= stage; i++) row[i]!++;
  };
  const others = Math.round((draft.applicants - 1) * appliedFraction);
  for (let i = 0; i < others; i++) {
    const s = weighted(SOURCE_LIST.map((x) => [x, SOURCE_MODEL[x].share] as const));
    const m = SOURCE_MODEL[s];
    let stage = 0;
    if (chance(m.pass[0])) stage = 1;
    if (stage === 1 && chance(m.pass[1])) stage = 2;
    if (stage === 2 && chance(m.pass[2])) {
      // Reached offer: only a declined offer stays at "Offered"; otherwise
      // the role went to the selected candidate and this one stops at interview.
      if (!chance(m.accept) && cap >= 3) {
        stage = 3;
        declined++;
      }
    }
    bump(s, Math.min(stage, cap));
  }
  // The candidate who is (or will be) hired.
  if (appliedFraction > 0 || filled) bump(draft.hireSource, filled ? 4 : Math.min(cap, 3));
  return { funnel, declined };
}

const sortedDrafts = drafts.sort((a, b) => +a.openedAt - +b.openedAt);
const reqSeq = new Map<number, number>();
const requisitions: Requisition[] = [];

for (const draft of sortedDrafts) {
  if (draft.openedAt > asOf) continue;
  const year = draft.openedAt.getFullYear();
  const seq = (reqSeq.get(year) ?? 0) + 1;
  reqSeq.set(year, seq);

  const tth = differenceInCalendarDays(draft.acceptedAt, draft.appliedAt);
  const screenedAt = addDays(draft.appliedAt, Math.max(1, Math.round(tth * 0.15)));
  const interviewedAt = addDays(draft.appliedAt, Math.max(2, Math.round(tth * 0.45)));
  const offeredAt = addDays(draft.acceptedAt, -Math.max(2, Math.round(tth * 0.1)));
  const end = draft.cancelAt ?? draft.acceptedAt;
  const closedBeforeAsOf = end <= asOf;
  const at = (d: Date) => (d <= asOf && d <= end ? iso(d) : null);

  let status: Requisition["status"];
  if (draft.cancelAt && closedBeforeAsOf) status = "Cancelled";
  else if (!draft.cancelAt && closedBeforeAsOf) status = "Filled";
  else status = differenceInCalendarDays(asOf, draft.openedAt) > 35 && chance(0.25) ? "On hold" : "Open";

  const milestones = [screenedAt, interviewedAt, offeredAt].filter((d) => d <= asOf && d <= end).length;
  const filled = status === "Filled";
  const cap = filled ? 4 : draft.cancelAt ? Math.min(milestones, 2) : milestones;
  const span = Math.max(1, differenceInCalendarDays(offeredAt, draft.openedAt));
  const appliedFraction = filled ? 1 : clamp(differenceInCalendarDays(draft.cancelAt && closedBeforeAsOf ? draft.cancelAt : asOf, draft.openedAt) / span, 0, 1);
  const { funnel, declined } = simulateFunnel(draft, cap, appliedFraction, filled);

  const manager = managerFor(draft.siteId, draft.department);
  requisitions.push({
    id: `REQ-${year}-${String(seq).padStart(4, "0")}`,
    title: draft.role,
    department: draft.department,
    siteId: draft.siteId,
    hiringManager: manager.name,
    recruiter: recruiters[(seq + draft.siteId.length) % recruiters.length]!,
    priority: draft.priority,
    status,
    openedAt: iso(draft.openedAt),
    stages: {
      screenedAt: at(screenedAt),
      interviewedAt: at(interviewedAt),
      offeredAt: draft.cancelAt ? null : at(offeredAt),
      filledAt: filled ? iso(draft.acceptedAt) : null,
    },
    closedAt: status === "Cancelled" ? iso(draft.cancelAt!) : filled ? iso(draft.acceptedAt) : null,
    funnel,
    offersMade: declined + (filled ? 1 : 0),
    offersAccepted: filled ? 1 : 0,
    hire: filled
      ? {
          employeeId: draft.employee?.id ?? null,
          source: draft.hireSource,
          appliedAt: iso(draft.appliedAt),
          acceptedAt: iso(draft.acceptedAt),
          startDate: iso(draft.startDate),
        }
      : null,
  });
}

/* ------------------------------------------------------------------ */
/* Onboarding                                                          */
/* ------------------------------------------------------------------ */

const ONBOARDING_PLAN: ReadonlyArray<{ item: OnboardingItem; dueOffset: number; mean: number; sd: number; clinicalOnly: boolean }> = [
  { item: "Documents & visa", dueOffset: 5, mean: -4, sd: 5, clinicalOnly: false },
  { item: "Biometric access", dueOffset: 2, mean: -1, sd: 2, clinicalOnly: false },
  { item: "Medical insurance", dueOffset: 14, mean: -5, sd: 6, clinicalOnly: false },
  { item: "Malpractice insurance", dueOffset: 7, mean: -3, sd: 5, clinicalOnly: true },
  { item: "Licence activation", dueOffset: 21, mean: 1, sd: 11, clinicalOnly: true },
];

const onboarding: OnboardingRecord[] = joiners.map((p) => {
  const clinical = CLINICAL_DEPARTMENTS.includes(p.department);
  const site = SITES.find((s) => s.id === p.siteId)!;
  return {
    employeeId: p.id,
    name: p.name,
    role: p.role,
    department: p.department,
    siteId: p.siteId,
    startDate: iso(p.hireDate),
    tasks: ONBOARDING_PLAN.filter((t) => clinical || !t.clinicalOnly).map((t) => {
      const due = addDays(p.hireDate, t.dueOffset);
      let mean = t.mean;
      if (t.item === "Licence activation" && site.regulator === "MOHAP") mean += 6;
      if (p.siteId === "nahda") mean += 3;
      let delay = normal(mean, t.sd);
      if (chance(0.03)) delay += between(20, 60); // long-tail blockers
      let completed = addDays(due, Math.round(delay));
      const earliest = addDays(p.hireDate, -20);
      if (completed < earliest) completed = earliest;
      if (p.exitDate && completed > p.exitDate) completed = p.exitDate;
      return {
        item: t.item,
        dueDate: iso(due),
        completedAt: completed <= asOf ? iso(completed) : null,
      };
    }),
  };
});

/* ------------------------------------------------------------------ */
/* Compliance                                                          */
/* ------------------------------------------------------------------ */

const HISTORY_START = parseISO("2024-07-01");
const INSURERS = ["Gulf Mutual Assurance", "Al Waha Insurance", "Crescent General Insurance"];
const credentials: Credential[] = [];
let credSeq = 1;

for (const p of activeAtAsOf) {
  if (!CLINICAL_DEPARTMENTS.includes(p.department)) continue;
  const site = SITES.find((s) => s.id === p.siteId)!;
  const insurer = faker.helpers.arrayElement(INSURERS);
  for (const type of ["Medical licence", "Malpractice insurance"] as const) {
    // Annual validity cycles that end on the same anniversary each year. Each
    // renewal happens `lead` days before the cycle ends (negative = late) and
    // is drawn independently per cycle, so the history is stationary.
    let leadMean = 28;
    if (site.regulator === "MOHAP") leadMean -= 10;
    if (p.siteId === "nahda") leadMean -= 8;
    const drawLead = () => clamp(Math.round(chance(0.14) ? normal(-14, 14) : normal(leadMean, 16)), -55, 80);
    const phase = addDays(asOf, intBetween(-60, 304));
    const ends = [-3, -2, -1, 0, 1].map((k) => addDays(phase, k * 365));
    const renewals = ends.map((e) => addDays(e, -drawLead()));
    const cycles: { from: string; to: string }[] = [];
    for (let i = 1; i < ends.length; i++) {
      const from = renewals[i - 1]!;
      if (from > asOf) break; // not renewed yet
      if (ends[i]! < HISTORY_START) continue;
      cycles.push({ from: iso(from), to: iso(ends[i]!) });
    }
    const current = cycles[cycles.length - 1]!;
    credentials.push({
      id: `CR-${String(credSeq++).padStart(5, "0")}`,
      employeeId: p.id,
      name: p.name,
      role: p.role,
      department: p.department,
      siteId: p.siteId,
      type,
      issuer: type === "Medical licence" ? site.regulator : insurer,
      expiryDate: current.to,
      renewedOn: current.from,
      trackedFrom: iso(p.hireDate),
      cycles,
    });
  }
}

const ILOE_LAUNCH = parseISO("2023-01-01");
const iloe: IloeRecord[] = activeAtAsOf.map((p) => {
  const base = p.hireDate < ILOE_LAUNCH ? addDays(ILOE_LAUNCH, intBetween(10, 270)) : addDays(p.hireDate, intBetween(4, 45));
  const missed = chance(p.siteId === "nahda" ? 0.07 : 0.022);
  if (missed) return { employeeId: p.id, siteId: p.siteId, department: p.department, status: "Not registered", registeredOn: null };
  if (base > asOf) return { employeeId: p.id, siteId: p.siteId, department: p.department, status: "Pending", registeredOn: null };
  return { employeeId: p.id, siteId: p.siteId, department: p.department, status: "Registered", registeredOn: iso(base) };
});

/* ------------------------------------------------------------------ */
/* Engagement                                                          */
/* ------------------------------------------------------------------ */

const DEPT_ENGAGEMENT: Record<Department, number> = {
  Nursing: 67, Medical: 74, "Allied Health": 72, "Front Office": 70, Admin: 73, Finance: 75, HR: 77,
};
const SITE_ENGAGEMENT: Record<string, number> = {
  barsha: 0, jumeirah: 1, mirdif: -1, marina: 1.5, nahda: 0, majaz: -0.5, muwaileh: -1.5, khalifa: 3, reem: 2,
};

const pulse: PulseResult[] = [];
for (let q = 0; q < 8; q++) {
  const quarterEnd = endOfMonth(addMonths(firstMonth, q * 3 + 2));
  const label = `${quarterEnd.getFullYear()}-Q${Math.floor(quarterEnd.getMonth() / 3) + 1}`;
  const summer = quarterEnd.getMonth() === 8;
  for (const site of SITES) {
    for (const dept of DEPARTMENTS) {
      const invited = people.filter((p) => p.siteId === site.id && p.department === dept && isEmployedOn(p, quarterEnd)).length;
      if (invited === 0) continue;
      const responseRate = site.id === "nahda" ? between(0.48, 0.6) : between(0.66, 0.84);
      const responses = Math.max(1, binomial(invited, responseRate));
      const siteEffect = site.id === "nahda" ? -5 - q * 1.35 : SITE_ENGAGEMENT[site.id]!;
      const score = clamp(
        DEPT_ENGAGEMENT[dept] + siteEffect + q * 0.45 - (summer ? 1.6 : 0) + normal(0, 4 / Math.sqrt(responses)),
        30,
        95,
      );
      const pProm = clamp(0.16 + (score - 60) * 0.012, 0.03, 0.7);
      const pDet = clamp(0.3 - (score - 60) * 0.012, 0.03, 0.7);
      const promoters = binomial(responses, pProm);
      const detractors = Math.min(responses - promoters, binomial(responses, pDet));
      pulse.push({
        quarter: label,
        siteId: site.id,
        department: dept,
        invited,
        responses,
        score: Math.round(score * 10) / 10,
        promoters,
        passives: responses - promoters - detractors,
        detractors,
      });
    }
  }
}

const checkIns: CheckInLog[] = [];
const CHECKIN_MONTHS = MONTHS.slice(12);
CHECKIN_MONTHS.forEach((monthStart, mi) => {
  const monthEnd = endOfMonth(monthStart);
  const groups = new Map<string, { manager: Person; siteId: string; department: Department; reports: Person[] }>();
  for (const p of people) {
    if (p.isLead || !p.manager) continue;
    if (!(p.hireDate <= monthEnd && (!p.exitDate || p.exitDate >= monthStart))) continue;
    const key = `${p.manager.id}:${p.siteId}`;
    if (!groups.has(key)) groups.set(key, { manager: p.manager, siteId: p.siteId, department: p.department, reports: [] });
    groups.get(key)!.reports.push(p);
  }
  for (const g of groups.values()) {
    let p = 0.82;
    if (g.siteId === "nahda") p = 0.58 - mi * 0.012;
    if (g.department === "Nursing") p *= 0.9;
    if (!hasLocalLead(g.siteId, g.department)) p *= 0.85; // remote manager
    if (monthStart.getMonth() >= 6 && monthStart.getMonth() <= 7) p *= 0.93; // summer leave
    const withCheckIn = binomial(g.reports.length, clamp(p + normal(0, 0.03), 0.1, 0.98));
    let total = 0;
    for (let i = 0; i < withCheckIn; i++) total += 1 + poisson(0.35);
    checkIns.push({
      month: monthKey(monthStart),
      siteId: g.siteId,
      department: g.department,
      managerId: g.manager.id,
      managerName: g.manager.name,
      reports: g.reports.length,
      reportsWithCheckIn: withCheckIn,
      checkIns: total,
    });
  }
});

/* ------------------------------------------------------------------ */
/* Write files                                                         */
/* ------------------------------------------------------------------ */

const outDir = path.join(process.cwd(), "data");
mkdirSync(outDir, { recursive: true });

/** One record per line: compact, but still diff-friendly and readable. */
function writeRows(file: string, rows: unknown[]) {
  const body = rows.map((r) => `  ${JSON.stringify(r)}`).join(",\n");
  writeFileSync(path.join(outDir, file), `[\n${body}\n]\n`);
}
function writeObject(file: string, obj: Record<string, unknown[]>) {
  const parts = Object.entries(obj).map(
    ([k, rows]) => `  ${JSON.stringify(k)}: [\n${rows.map((r) => `    ${JSON.stringify(r)}`).join(",\n")}\n  ]`,
  );
  writeFileSync(path.join(outDir, file), `{\n${parts.join(",\n")}\n}\n`);
}

const meta: DatasetMeta = {
  organisation: ORGANISATION,
  asOf: AS_OF,
  firstMonth: FIRST_MONTH,
  lastMonth: LAST_MONTH,
  seed: SEED,
  generatedAt: AS_OF,
  sites: SITES,
};
writeFileSync(path.join(outDir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
writeRows("employees.json", employees);
writeRows("snapshots.json", snapshots);
writeRows("requisitions.json", requisitions);
writeRows("onboarding.json", onboarding);
writeObject("compliance.json", { credentials, iloe });
writeObject("engagement.json", { pulse, checkIns });

/* ------------------------------------------------------------------ */
/* Sanity report                                                       */
/* ------------------------------------------------------------------ */

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const lastYear = snapshots.filter((s) => s.month > "2025-09");
const sum = (rows: MonthlySnapshot[], f: (s: MonthlySnapshot) => number) => rows.reduce((a, s) => a + f(s), 0);
const annualAttrition = (rows: MonthlySnapshot[]) => {
  const exits = sum(rows, (s) => s.exitsVoluntary + s.exitsInvoluntary);
  const months = new Set(rows.map((r) => r.month)).size;
  const avgHc = sum(rows, (s) => (s.headcountStart + s.headcountEnd) / 2) / months;
  return exits / avgHc;
};
console.log(`Employees: ${employees.length} records, ${activeAtAsOf.length} active at ${AS_OF}`);
console.log(`Starting headcount: ${people.filter((p) => isEmployedOn(p, firstMonth) && p.hireDate < firstMonth).length}`);
console.log(`TTM attrition: ${pct(annualAttrition(lastYear))}`);
for (const d of DEPARTMENTS) console.log(`  ${d.padEnd(14)} ${pct(annualAttrition(lastYear.filter((s) => s.department === d)))}`);
for (const s of SITES) console.log(`  ${s.short.padEnd(18)} ${pct(annualAttrition(lastYear.filter((r) => r.siteId === s.id)))}`);
const byMonth = new Map<string, number>();
for (const s of snapshots) byMonth.set(s.month, (byMonth.get(s.month) ?? 0) + s.exitsVoluntary);
console.log(`Voluntary exits by month: ${[...byMonth.entries()].map(([m, v]) => `${m.slice(2)}:${v}`).join(" ")}`);
const hcByMonth = new Map<string, number>();
for (const s of snapshots) hcByMonth.set(s.month, (hcByMonth.get(s.month) ?? 0) + s.headcountEnd);
console.log(`Headcount: ${[...hcByMonth.entries()].map(([m, v]) => `${m.slice(2)}:${v}`).join(" ")}`);
console.log(`Requisitions: ${requisitions.length} (${requisitions.filter((r) => r.status === "Open").length} open, ${requisitions.filter((r) => r.status === "On hold").length} on hold)`);
for (const src of SOURCE_LIST) {
  let applied = 0;
  let hired = 0;
  for (const r of requisitions) {
    const f = r.funnel[src];
    if (f) {
      applied += f[0];
      hired += f[4];
    }
  }
  console.log(`  ${src.padEnd(20)} applied ${String(applied).padStart(5)} hired ${String(hired).padStart(4)} conv ${pct(hired / applied)}`);
}
const now = (c: Credential) => differenceInCalendarDays(parseISO(c.expiryDate), asOf);
console.log(`Credentials: ${credentials.length}; overdue ${credentials.filter((c) => now(c) < 0).length}; <=30d ${credentials.filter((c) => now(c) >= 0 && now(c) <= 30).length}; 31-60d ${credentials.filter((c) => now(c) > 30 && now(c) <= 60).length}; 61-90d ${credentials.filter((c) => now(c) > 60 && now(c) <= 90).length}`);
console.log(`ILOE: ${["Registered", "Pending", "Not registered"].map((s) => `${s} ${iloe.filter((i) => i.status === s).length}`).join(", ")}`);
{
  const cutoff = addDays(asOf, -365);
  const cohort = people.filter((p) => p.source && p.hireDate <= cutoff);
  const early = (rows: Person[]) => rows.filter((p) => p.exitDate && differenceInCalendarDays(p.exitDate, p.hireDate) < 365).length / Math.max(1, rows.length);
  console.log(`First-year attrition: referral ${pct(early(cohort.filter((p) => p.source === "Employee referral")))} vs other ${pct(early(cohort.filter((p) => p.source !== "Employee referral")))}`);
}
console.log(`Onboarding records: ${onboarding.length}; pulse rows ${pulse.length}; check-in rows ${checkIns.length}`);
