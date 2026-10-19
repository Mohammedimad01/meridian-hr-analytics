"use client";

import { Suspense, useDeferredValue, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Command as CommandPrimitive } from "cmdk";
import { CornerDownLeft, Loader2, Moon, RotateCcw, Search, Sun, UserRound } from "lucide-react";
import { useTheme } from "next-themes";
import { useDataset } from "@/lib/data";
import { useFilters, withQuery } from "@/hooks/use-filters";
import { NAV_ITEMS } from "@/lib/nav";
import { siteShort } from "@/lib/org";
import type { Employee } from "@/lib/types";

const itemClass =
  "flex cursor-default items-center gap-3 rounded-md px-2 py-2 text-sm outline-none select-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";
const groupClass =
  "px-1.5 py-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground";

export default function Palette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { filterQuery, resetFilters } = useFilters();
  const { resolvedTheme, setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const pages = NAV_ITEMS.filter(
    (p) => !deferredQuery || `${p.label} ${p.keywords}`.toLowerCase().includes(deferredQuery),
  );

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <CommandPrimitive shouldFilter={false} loop className="flex flex-col bg-popover text-popover-foreground">
      <div className="flex h-12 items-center gap-2 border-b px-3">
        <Search className="size-4 text-muted-foreground" aria-hidden />
        <CommandPrimitive.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Search reports or employees…"
          className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">Esc</kbd>
      </div>
      <CommandPrimitive.List className="max-h-[min(420px,60vh)] scroll-py-1 overflow-y-auto overscroll-contain">
        <CommandPrimitive.Empty className="py-8 text-center text-sm text-muted-foreground">
          No reports or employees match “{query}”.
        </CommandPrimitive.Empty>
        {pages.length > 0 && (
          <CommandPrimitive.Group heading="Reports" className={groupClass}>
            {pages.map((p) => (
              <CommandPrimitive.Item key={p.href} value={`page-${p.href}`} onSelect={() => go(withQuery(p.href, filterQuery))} className={itemClass}>
                <p.icon aria-hidden />
                {p.label}
              </CommandPrimitive.Item>
            ))}
          </CommandPrimitive.Group>
        )}
        {deferredQuery.length >= 2 && (
          <Suspense
            fallback={
              <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Loading directory…
              </div>
            }
          >
            <EmployeeResults query={deferredQuery} onSelect={(e) => go(withQuery("/workforce/", [filterQuery, `employee=${e.id}`].filter(Boolean).join("&")))} />
          </Suspense>
        )}
        {!deferredQuery && (
          <CommandPrimitive.Group heading="Actions" className={groupClass}>
            <CommandPrimitive.Item
              value="toggle-theme"
              onSelect={() => {
                setTheme(resolvedTheme === "dark" ? "light" : "dark");
                onClose();
              }}
              className={itemClass}
            >
              {resolvedTheme === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}
              Switch to {resolvedTheme === "dark" ? "light" : "dark"} theme
            </CommandPrimitive.Item>
            <CommandPrimitive.Item
              value="reset-filters"
              onSelect={() => {
                resetFilters();
                onClose();
              }}
              className={itemClass}
            >
              <RotateCcw aria-hidden />
              Reset filters
            </CommandPrimitive.Item>
          </CommandPrimitive.Group>
        )}
      </CommandPrimitive.List>
      <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
        <span>Type 2+ characters to search 1,600+ employee records</span>
        <span className="flex items-center gap-1">
          <CornerDownLeft className="size-3.5" aria-hidden /> to open
        </span>
      </div>
    </CommandPrimitive>
  );
}

function EmployeeResults({ query, onSelect }: { query: string; onSelect: (e: Employee) => void }) {
  const employees = useDataset("employees");
  const matches = useMemo(() => {
    const out: Employee[] = [];
    for (const e of employees) {
      if (`${e.name} ${e.id} ${e.role}`.toLowerCase().includes(query)) out.push(e);
      if (out.length >= 12) break;
    }
    return out;
  }, [employees, query]);

  if (matches.length === 0) return null;
  return (
    <CommandPrimitive.Group heading="Employees" className={groupClass}>
      {matches.map((e) => (
        <CommandPrimitive.Item key={e.id} value={`emp-${e.id}`} onSelect={() => onSelect(e)} className={itemClass}>
          <UserRound aria-hidden />
          <span className="min-w-0 flex-1 truncate">
            {e.name}
            <span className="text-muted-foreground"> · {e.role}</span>
          </span>
          <span className="num shrink-0 text-xs text-muted-foreground">
            {e.status === "Exited" ? "Exited · " : ""}
            {siteShort(e.siteId)} · {e.id}
          </span>
        </CommandPrimitive.Item>
      ))}
    </CommandPrimitive.Group>
  );
}
