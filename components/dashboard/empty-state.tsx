"use client";

import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFilters } from "@/hooks/use-filters";
import { cn } from "@/lib/utils";

export function EmptyState({
  title = "No data for this selection",
  description = "Nothing matches the current filters. Widen the date range or clear the site and department filters.",
  className,
  showReset = true,
}: {
  title?: string;
  description?: string;
  className?: string;
  showReset?: boolean;
}) {
  const { resetFilters } = useFilters();
  return (
    <div
      role="status"
      className={cn("flex flex-col items-center justify-center gap-2 rounded-md px-6 py-10 text-center", className)}
    >
      <SearchX className="size-5 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</p>
      {showReset && (
        <Button variant="outline" size="sm" className="mt-2 h-8" onClick={resetFilters}>
          Reset filters
        </Button>
      )}
    </div>
  );
}
