import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageSkeleton } from "@/components/dashboard/skeletons";
import { WorkforceReport } from "@/components/reports/workforce";

export const metadata: Metadata = { title: "Workforce" };

export default function WorkforcePage() {
  return (
    <>
      <PageHeader
        title="Workforce"
        description="Who works at Meridian: composition by site, department, nationality, gender and tenure, plus the full employee directory."
      />
      <Suspense fallback={<PageSkeleton panels={6} />}>
        <WorkforceReport />
      </Suspense>
    </>
  );
}
