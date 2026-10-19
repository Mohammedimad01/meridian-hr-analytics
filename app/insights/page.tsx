import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageSkeleton } from "@/components/dashboard/skeletons";
import { InsightsReport } from "@/components/reports/insights";

export const metadata: Metadata = { title: "Insights" };

export default function InsightsPage() {
  return (
    <>
      <PageHeader
        title="Insights"
        description="An analyst's memo: what the data says, the evidence behind each finding, and the HR action it calls for."
      />
      <Suspense fallback={<PageSkeleton panels={2} />}>
        <InsightsReport />
      </Suspense>
    </>
  );
}
