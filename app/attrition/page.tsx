import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageSkeleton } from "@/components/dashboard/skeletons";
import { AttritionReport } from "@/components/reports/attrition";

export const metadata: Metadata = { title: "Attrition" };

export default function AttritionPage() {
  return (
    <>
      <PageHeader
        title="Attrition"
        description="Who is leaving, when and why: monthly exits, voluntary versus involuntary, exit reasons, hot spots by department and site, and first-year attrition."
      />
      <Suspense fallback={<PageSkeleton kpis={4} panels={4} />}>
        <AttritionReport />
      </Suspense>
    </>
  );
}
