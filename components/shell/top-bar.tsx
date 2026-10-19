"use client";

import { Suspense } from "react";
import { FlaskConical, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { GlobalFilters, GlobalFiltersSkeleton } from "@/components/filters/global-filters";
import { useCommandPalette } from "./command-palette";
import { ThemeToggle } from "./theme-toggle";

export function SyntheticBadge() {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs font-medium text-muted-foreground"
      title="All people, sites and figures are generated. Meridian Health Group is fictional."
    >
      <FlaskConical className="size-3.5" aria-hidden />
      <span>
        Synthetic data<span className="hidden xl:inline"> · portfolio project</span>
      </span>
    </span>
  );
}

export function TopBar() {
  const { setOpen } = useCommandPalette();
  return (
    <header className="sticky top-0 z-20 border-b bg-background">
      <div className="flex h-14 items-center gap-2 px-3 md:px-4">
        <SidebarTrigger className="size-8" aria-label="Toggle sidebar" />
        <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-5" />
        <Suspense fallback={<GlobalFiltersSkeleton className="hidden lg:flex" />}>
          <GlobalFilters className="hidden lg:flex" />
        </Suspense>
        <div className="ml-auto flex items-center gap-2">
          <SyntheticBadge />
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-2 px-2 font-normal text-muted-foreground sm:w-44 sm:justify-start sm:px-3"
            onClick={() => setOpen(true)}
            aria-label="Search reports and employees"
            aria-keyshortcuts="Control+K Meta+K"
          >
            <Search className="size-4" aria-hidden />
            <span className="hidden sm:inline">Search…</span>
            <kbd className="ml-auto hidden rounded border bg-muted px-1.5 font-mono text-[11px] sm:inline">⌘K</kbd>
          </Button>
          <ThemeToggle />
        </div>
      </div>
      <div className="overflow-x-auto border-t px-3 py-2 lg:hidden">
        <Suspense fallback={<GlobalFiltersSkeleton />}>
          <GlobalFilters className="w-max" />
        </Suspense>
      </div>
    </header>
  );
}
