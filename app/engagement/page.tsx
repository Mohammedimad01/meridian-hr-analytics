import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageSkeleton } from "@/components/dashboard/skeletons";
import { EngagementReport } from "@/components/reports/engagement";

export const metadata: Metadata = { title: "Engagement" };

export default function EngagementPage() {
  return (
    <>
      <PageHeader
        title="Engagement"
        description="Quarterly pulse survey results and manager 1-on-1 check-ins: the leading indicators that tend to move before attrition does."
      />
      <Suspense fallback={<PageSkeleton kpis={4} panels={4} />}>
        <EngagementReport />
      </Suspense>
    </>
  );
}
