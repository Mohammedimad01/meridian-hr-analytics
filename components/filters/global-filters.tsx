"use client";

import { useState } from "react";
import { Building2, CalendarRange, Check, Layers, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useFilters } from "@/hooks/use-filters";
import { DATE_PRESETS, isDefaultFilters } from "@/lib/filters";
import { formatMonth, monthRange } from "@/lib/months";
import { FIRST_MONTH, LAST_MONTH, SITES } from "@/lib/org";
import { DEPARTMENTS, type Department, type Emirate } from "@/lib/types";
import { cn } from "@/lib/utils";

const ALL = "all";
const MONTHS = monthRange(FIRST_MONTH, LAST_MONTH);
const EMIRATES: Emirate[] = ["Dubai", "Sharjah", "Abu Dhabi"];

function DateRangeFilter() {
  const { filters, setFilters } = useFilters();
  const [open, setOpen] = useState(false);
  const activePreset = DATE_PRESETS.find((p) => p.from === filters.from && p.to === filters.to);
  const label = `${formatMonth(filters.from, "MMM yyyy")} – ${formatMonth(filters.to, "MMM yyyy")}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2 font-normal" aria-label={`Date range: ${label}`}>
          <CalendarRange className="size-4 text-muted-foreground" aria-hidden />
          <span className="num">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="p-1" role="listbox" aria-label="Date range presets">
          {DATE_PRESETS.map((p) => {
            const selected = activePreset?.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  setFilters({ from: p.from, to: p.to });
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors duration-150 hover:bg-accent focus-visible:bg-accent"
              >
                <span>{p.label}</span>
                <span className="flex items-center gap-2">
                  <span className="num text-xs text-muted-foreground">
                    {formatMonth(p.from)} – {formatMonth(p.to)}
                  </span>
                  <Check className={cn("size-4 text-brand", selected ? "opacity-100" : "opacity-0")} aria-hidden />
                </span>
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-2 border-t p-3">
          <p className="col-span-2 text-xs font-medium text-muted-foreground">Custom range</p>
          <MonthSelect
            label="From"
            value={filters.from}
            months={MONTHS.filter((m) => m <= filters.to)}
            onChange={(from) => setFilters({ from })}
          />
          <MonthSelect
            label="To"
            value={filters.to}
            months={MONTHS.filter((m) => m >= filters.from)}
            onChange={(to) => setFilters({ to })}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MonthSelect({
  label,
  value,
  months,
  onChange,
}: {
  label: string;
  value: string;
  months: string[];
  onChange: (m: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className="w-full" aria-label={`${label} month`}>
        <span className="text-muted-foreground">{label}</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {months.map((m) => (
          <SelectItem key={m} value={m} className="num">
            {formatMonth(m, "MMM yyyy")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SiteFilter() {
  const { filters, setFilters } = useFilters();
  return (
    <Select value={filters.siteId ?? ALL} onValueChange={(v) => setFilters({ siteId: v === ALL ? null : v })}>
      <SelectTrigger size="sm" className="h-8 min-w-36 gap-2" aria-label="Site">
        <Building2 className="size-4" aria-hidden />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All sites</SelectItem>
        {EMIRATES.map((emirate) => (
          <SelectGroup key={emirate}>
            <SelectSeparator />
            <SelectLabel>{emirate}</SelectLabel>
            {SITES.filter((s) => s.emirate === emirate).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.short}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

function DepartmentFilter() {
  const { filters, setFilters } = useFilters();
  return (
    <Select
      value={filters.department ?? ALL}
      onValueChange={(v) => setFilters({ department: v === ALL ? null : (v as Department) })}
    >
      <SelectTrigger size="sm" className="h-8 min-w-36 gap-2" aria-label="Department">
        <Layers className="size-4" aria-hidden />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All departments</SelectItem>
        <SelectSeparator />
        {DEPARTMENTS.map((d) => (
          <SelectItem key={d} value={d}>
            {d}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function GlobalFilters({ className }: { className?: string }) {
  const { filters, resetFilters } = useFilters();
  return (
    <div className={cn("flex items-center gap-2", className)} role="group" aria-label="Report filters">
      <DateRangeFilter />
      <SiteFilter />
      <DepartmentFilter />
      {!isDefaultFilters(filters) && (
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground" onClick={resetFilters}>
          <RotateCcw className="size-3.5" aria-hidden />
          Reset
        </Button>
      )}
    </div>
  );
}

export function GlobalFiltersSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)} aria-hidden>
      <Skeleton className="h-8 w-52" />
      <Skeleton className="h-8 w-36" />
      <Skeleton className="h-8 w-36" />
    </div>
  );
}
