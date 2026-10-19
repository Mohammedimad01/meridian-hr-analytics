import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageSkeleton } from "@/components/dashboard/skeletons";
import { RecruitmentReport } from "@/components/reports/recruitment";

export const metadata: Metadata = { title: "Recruitment" };

export default function RecruitmentPage() {
  return (
    <>
      <PageHeader
        title="Recruitment"
        description="How well Meridian hires: pipeline conversion, time to hire, which sources deliver, and the requisitions still open."
      />
      <Suspense fallback={<PageSkeleton kpis={4} panels={4} />}>
        <RecruitmentReport />
      </Suspense>
    </>
  );
}
