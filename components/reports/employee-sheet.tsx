"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDate } from "@/lib/months";
import { SALARY_BAND_LABELS, SITE_BY_ID } from "@/lib/org";
import type { Employee } from "@/lib/types";

export function EmployeeSheet({ employee, onClose }: { employee: Employee | null; asOf: string; onClose: () => void }) {
  const site = employee ? SITE_BY_ID[employee.siteId] : null;
  const rows: [string, string][] = employee
    ? [
        ["Employee ID", employee.id],
        ["Role", employee.role],
        ["Department", employee.department],
        ["Site", site ? `${site.name}, ${site.emirate}` : employee.siteId],
        ["Manager", employee.managerName ?? "—"],
        ["Nationality", employee.nationality],
        ["Gender", employee.gender],
        ["Hire date", formatDate(employee.hireDate)],
        ["Tenure", `${employee.tenureYears.toFixed(1)} years`],
        ["Salary band", `${employee.salaryBand} · ${SALARY_BAND_LABELS[employee.salaryBand]}`],
        ["Hiring source", employee.source ?? "Hired before Oct 2024"],
        ["Status", employee.status],
        ...(employee.exitDate
          ? ([
              ["Exit date", formatDate(employee.exitDate)],
              ["Exit type", employee.exitType ?? "—"],
              ["Exit reason", employee.exitReason ?? "—"],
            ] as [string, string][])
          : []),
      ]
    : [];

  return (
    <Sheet open={!!employee} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        {employee && (
          <>
            <SheetHeader className="border-b">
              <SheetTitle className="text-base">{employee.name}</SheetTitle>
              <SheetDescription>
                {employee.role} · {site?.short}
              </SheetDescription>
            </SheetHeader>
            <dl className="divide-y overflow-y-auto px-4 text-sm">
              {rows.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[8.5rem_1fr] gap-3 py-2.5">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="num break-words">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-auto border-t px-4 py-3 text-xs text-muted-foreground">
              Synthetic record. This person does not exist.
            </p>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
