import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageSkeleton } from "@/components/dashboard/skeletons";
import { OnboardingReport } from "@/components/reports/onboarding";

export const metadata: Metadata = { title: "Onboarding & Compliance" };

export default function OnboardingPage() {
  return (
    <>
      <PageHeader
        title="Onboarding & Compliance"
        description="Joiner checklists, medical licence and malpractice renewals, and ILOE registration. Clinical staff cannot practise without an active licence and malpractice cover."
      />
      <Suspense fallback={<PageSkeleton kpis={4} panels={4} />}>
        <OnboardingReport />
      </Suspense>
    </>
  );
}
