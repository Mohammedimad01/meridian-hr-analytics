"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DEFAULT_FILTERS, parseFilters, writeFilters, type Filters } from "@/lib/filters";

/**
 * Global filters live in the URL (?from=&to=&site=&dept=) so every view is
 * shareable and survives reloads. Must be rendered inside <Suspense>.
 */
export function useFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = searchParams.toString();

  const filters = useMemo(() => parseFilters(new URLSearchParams(raw)), [raw]);

  const replaceParams = useCallback(
    (params: URLSearchParams) => {
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const setFilters = useCallback(
    (patch: Partial<Filters>) => replaceParams(writeFilters({ ...filters, ...patch }, new URLSearchParams(raw))),
    [filters, raw, replaceParams],
  );

  const resetFilters = useCallback(
    () => replaceParams(writeFilters(DEFAULT_FILTERS, new URLSearchParams(raw))),
    [raw, replaceParams],
  );

  /** Filter-only query string, for links that should carry the current view. */
  const filterQuery = useMemo(() => writeFilters(filters).toString(), [filters]);

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(raw);
      if (value) params.set(key, value);
      else params.delete(key);
      replaceParams(params);
    },
    [raw, replaceParams],
  );

  return { filters, setFilters, resetFilters, filterQuery, searchParams, setParam };
}

export function withQuery(href: string, query: string): string {
  return query ? `${href}?${query}` : href;
}
