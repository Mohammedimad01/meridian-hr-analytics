"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlaskConical } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { useFilters, withQuery } from "@/hooks/use-filters";
import { NAV_ITEMS, normalizePath } from "@/lib/nav";
import { AS_OF, ORGANISATION } from "@/lib/org";
import { formatDate } from "@/lib/months";

function NavLinks({ query }: { query: string }) {
  const pathname = normalizePath(usePathname());
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <SidebarMenu>
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              asChild
              isActive={active}
              tooltip={item.label}
              className="h-8 font-normal data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground"
            >
              <Link
                href={withQuery(item.href, query)}
                aria-current={active ? "page" : undefined}
                onClick={() => isMobile && setOpenMobile(false)}
              >
                <item.icon className={active ? "text-brand" : undefined} aria-hidden />
                <span>{item.label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

function NavLinksWithFilters() {
  const { filterQuery } = useFilters();
  return <NavLinks query={filterQuery} />;
}

export function BrandMark({ className = "size-7" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-md bg-primary text-[13px] font-semibold tracking-tight text-primary-foreground ${className}`}
    >
      M
    </span>
  );
}

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon" aria-label="Primary">
      <SidebarHeader className="h-14 justify-center border-b border-sidebar-border px-3 group-data-[collapsible=icon]:px-2">
        <Link href="/" className="flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <BrandMark />
          <span className="grid leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-semibold text-foreground">Meridian Health</span>
            <span className="truncate text-xs text-muted-foreground">People Analytics</span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Reports</SidebarGroupLabel>
          <SidebarGroupContent>
            <Suspense fallback={<NavLinks query="" />}>
              <NavLinksWithFilters />
            </Suspense>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-3 group-data-[collapsible=icon]:p-2">
        <div className="grid gap-1.5 text-xs group-data-[collapsible=icon]:hidden">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border bg-background px-2 py-0.5 font-medium text-foreground">
            <FlaskConical className="size-3.5" aria-hidden />
            Synthetic data
          </span>
          <p className="leading-relaxed text-muted-foreground">
            {ORGANISATION} is fictional. Portfolio project, not real employee data.
          </p>
          <p className="num text-muted-foreground">Data as of {formatDate(AS_OF)}</p>
        </div>
        <span
          className="hidden size-8 place-items-center rounded-md border border-border bg-background text-muted-foreground group-data-[collapsible=icon]:grid"
          title="Synthetic data – portfolio project"
        >
          <FlaskConical className="size-4" aria-label="Synthetic data – portfolio project" />
        </span>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
