import {
  BriefcaseBusiness,
  LayoutGrid,
  Lightbulb,
  MessagesSquare,
  ShieldCheck,
  TrendingDown,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  keywords: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutGrid, keywords: "home kpi summary dashboard" },
  { href: "/workforce/", label: "Workforce", icon: Users, keywords: "headcount directory composition employees" },
  { href: "/attrition/", label: "Attrition", icon: TrendingDown, keywords: "turnover exits leavers retention" },
  { href: "/recruitment/", label: "Recruitment", icon: BriefcaseBusiness, keywords: "hiring funnel requisitions sources time to hire" },
  { href: "/onboarding/", label: "Onboarding & Compliance", icon: ShieldCheck, keywords: "joiners checklist licence insurance iloe expiry" },
  { href: "/engagement/", label: "Engagement", icon: MessagesSquare, keywords: "pulse survey enps one-on-one check-in" },
  { href: "/insights/", label: "Insights", icon: Lightbulb, keywords: "findings memo recommendations analysis" },
];

export function normalizePath(pathname: string): string {
  if (pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}
