import { Suspense } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageSkeleton } from "@/components/dashboard/skeletons";
import { OverviewReport } from "@/components/reports/overview";

export default function OverviewPage() {
  return (
    <>
      <PageHeader
        title="Workforce overview"
        description="Headline people metrics for Meridian Health Group: one hospital and eight clinics across Dubai, Sharjah and Abu Dhabi."
      />
      <Suspense fallback={<PageSkeleton kpis={6} panels={4} />}>
        <OverviewReport />
      </Suspense>
    </>
  );
}
