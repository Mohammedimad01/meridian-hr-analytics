import type { Site } from "./types";

export const ORGANISATION = "Meridian Health Group";

/** Data is reported as of the last complete month. */
export const AS_OF = "2026-09-30";
export const FIRST_MONTH = "2024-10";
export const LAST_MONTH = "2026-09";

export const SITES: Site[] = [
  { id: "barsha", name: "Meridian Hospital Al Barsha", short: "Al Barsha Hospital", emirate: "Dubai", type: "Hospital", regulator: "DHA" },
  { id: "jumeirah", name: "Meridian Clinic Jumeirah", short: "Jumeirah", emirate: "Dubai", type: "Clinic", regulator: "DHA" },
  { id: "mirdif", name: "Meridian Clinic Mirdif", short: "Mirdif", emirate: "Dubai", type: "Clinic", regulator: "DHA" },
  { id: "marina", name: "Meridian Clinic Dubai Marina", short: "Dubai Marina", emirate: "Dubai", type: "Clinic", regulator: "DHA" },
  { id: "nahda", name: "Meridian Clinic Al Nahda", short: "Al Nahda", emirate: "Sharjah", type: "Clinic", regulator: "MOHAP" },
  { id: "majaz", name: "Meridian Clinic Al Majaz", short: "Al Majaz", emirate: "Sharjah", type: "Clinic", regulator: "MOHAP" },
  { id: "muwaileh", name: "Meridian Clinic Muwaileh", short: "Muwaileh", emirate: "Sharjah", type: "Clinic", regulator: "MOHAP" },
  { id: "khalifa", name: "Meridian Clinic Khalifa City", short: "Khalifa City", emirate: "Abu Dhabi", type: "Clinic", regulator: "DOH" },
  { id: "reem", name: "Meridian Clinic Al Reem", short: "Al Reem", emirate: "Abu Dhabi", type: "Clinic", regulator: "DOH" },
];

export const SITE_BY_ID: Record<string, Site> = Object.fromEntries(
  SITES.map((s) => [s.id, s]),
);

export function siteShort(id: string): string {
  return SITE_BY_ID[id]?.short ?? id;
}

export const SALARY_BAND_LABELS: Record<string, string> = {
  B1: "AED 4–7k",
  B2: "AED 7–12k",
  B3: "AED 12–20k",
  B4: "AED 20–35k",
  B5: "AED 35–55k",
  B6: "AED 55k+",
};
