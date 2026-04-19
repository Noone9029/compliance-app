"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import {
  presentOrganizationName,
  presentOrganizationSlug
} from "./presentation";

type ShellNavItem = {
  key: string;
  label: string;
  href: string;
  icon: NavIconKey;
  matchPrefixes?: string[];
  exact?: boolean;
};

export type NavIconKey =
  | "overview"
  | "dashboard"
  | "stats"
  | "accounting"
  | "reports"
  | "charts"
  | "contacts"
  | "audit"
  | "settings"
  | "subscription"
  | "compliance"
  | "hr"
  | "task"
  | "apps"
  | "list";

export function TenantShell({
  orgName,
  orgSlug,
  headerActions,
  navItems,
  moduleItems,
  children
}: {
  orgName: string;
  orgSlug: string;
  headerActions?: ReactNode;
  navItems: ShellNavItem[];
  moduleItems?: ShellNavItem[];
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const [mobileOpen, setMobileOpen] = useState(false);
  const visibleModules = moduleItems?.filter((item) => item.href) ?? [];
  const displayOrgName = presentOrganizationName(orgName);
  const displayOrgSlug = presentOrganizationSlug(orgSlug);
  const activeNavLabel = useMemo(
    () =>
      [...navItems, ...visibleModules].find((item) => isActivePath(pathname, item))?.label ??
      "Overview",
    [navItems, pathname, visibleModules]
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#ffffff_0%,#f3f5fb_42%,#edf1f7_100%)] text-slate-900">
      <div className="mx-auto max-w-[1600px] md:grid md:min-h-screen md:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden border-r border-white/60 bg-white/72 px-5 py-6 backdrop-blur-xl md:flex md:flex-col">
          <SidebarBrand orgName={displayOrgName} orgSlug={displayOrgSlug} />
          <div className="mt-8 flex-1 overflow-y-auto pr-1">
            <SidebarNav items={navItems} pathname={pathname} title="Workspace" />
            {visibleModules.length > 0 ? (
              <SidebarNav
                compact
                items={visibleModules}
                pathname={pathname}
                title="More Modules"
              />
            ) : null}
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-20 border-b border-white/70 bg-white/78 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">
                  Daftar Workspace
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                    Welcome back to your workspace
                  </h1>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                    {activeNavLabel}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {displayOrgName} · Active workspace
                </p>
              </div>

              <div className="hidden items-center gap-3 md:flex">
                {headerActions}
              </div>

              <button
                aria-expanded={mobileOpen}
                aria-label="Toggle navigation"
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-emerald-200 hover:text-emerald-700 md:hidden"
                onClick={() => setMobileOpen((current) => !current)}
                type="button"
              >
                <span className="space-y-1">
                  <span className="block h-0.5 w-5 rounded-full bg-current" />
                  <span className="block h-0.5 w-5 rounded-full bg-current" />
                  <span className="block h-0.5 w-5 rounded-full bg-current" />
                </span>
              </button>
            </div>

            <div className="border-t border-slate-100 px-4 py-3 md:hidden sm:px-6">
              <div className="flex items-center gap-3 overflow-x-auto pb-1">
                {headerActions}
              </div>
            </div>

            {mobileOpen ? (
              <div className="border-t border-slate-100 bg-white px-4 py-4 md:hidden sm:px-6">
                <SidebarNav
                  items={navItems}
                  pathname={pathname}
                  title="Workspace"
                />
                {visibleModules.length > 0 ? (
                  <SidebarNav
                    compact
                    items={visibleModules}
                    pathname={pathname}
                    title="More Modules"
                  />
                ) : null}
              </div>
            ) : null}
          </header>

          <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <div className="mx-auto max-w-[1280px]">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}

function SidebarBrand({
  orgName,
  orgSlug
}: {
  orgName: string;
  orgSlug: string;
}) {
  return (
    <div className="space-y-4 rounded-[28px] border border-slate-200/80 bg-white px-5 py-5 shadow-[0_24px_50px_-28px_rgba(15,23,42,0.25)]">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 shadow-inner">
          <svg className="h-7 w-7" fill="none" viewBox="0 0 28 28">
            <path
              d="M7 7.5h8.5l5.5 5.5v7.5A2.5 2.5 0 0 1 18.5 23h-11A2.5 2.5 0 0 1 5 20.5v-10A3 3 0 0 1 8 7.5Z"
              stroke="currentColor"
              strokeLinejoin="round"
              strokeWidth="1.7"
            />
            <path
              d="M15.5 7.5V13H21"
              stroke="currentColor"
              strokeLinejoin="round"
              strokeWidth="1.7"
            />
            <path
              d="M9.5 16h7M9.5 19.5h5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.7"
            />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-semibold tracking-tight text-slate-950">Daftar</p>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-emerald-700">
            Finance Workspace
          </p>
        </div>
      </div>
      <div className="rounded-2xl bg-slate-50 px-4 py-3">
        <p className="truncate text-sm font-semibold text-slate-900">{orgName}</p>
        <p className="mt-1 truncate text-xs uppercase tracking-[0.18em] text-slate-500">
          {orgSlug}
        </p>
      </div>
    </div>
  );
}

function SidebarNav({
  title,
  items,
  pathname,
  compact = false
}: {
  title: string;
  items: ShellNavItem[];
  pathname: string;
  compact?: boolean;
}) {
  return (
    <section className={compact ? "mt-8" : ""}>
      <p className="mb-3 px-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
        {title}
      </p>
      <nav className={compact ? "space-y-2" : "space-y-1.5"}>
        {items.map((item) => {
          const active = isActivePath(pathname, item);

          return (
            <a
              className={[
                "group flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-sm font-medium transition",
                active
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900 shadow-sm"
                  : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-950"
              ].join(" ")}
              href={item.href}
              key={item.key}
            >
              <span
                className={[
                  "flex h-10 w-10 items-center justify-center rounded-2xl transition",
                  active
                    ? "bg-white text-emerald-700 shadow-sm"
                    : "bg-slate-100 text-slate-500 group-hover:bg-slate-900 group-hover:text-white"
                ].join(" ")}
              >
                <NavIcon icon={item.icon} />
              </span>
              <span className="truncate">{item.label}</span>
            </a>
          );
        })}
      </nav>
    </section>
  );
}

function isActivePath(pathname: string, item: ShellNavItem) {
  if (item.exact) {
    return pathname === item.href;
  }

  if (item.matchPrefixes?.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return true;
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavIcon({ icon }: { icon: NavIconKey }) {
  const common = "h-5 w-5";

  if (icon === "overview") {
    return (
      <svg className={common} fill="none" viewBox="0 0 24 24">
        <rect x="3.5" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <rect x="13.5" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <rect x="3.5" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <rect x="13.5" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }

  if (icon === "dashboard") {
    return (
      <svg className={common} fill="none" viewBox="0 0 24 24">
        <path d="M4 20V9m6 11V4m6 16v-7m4 7V7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (icon === "stats") {
    return (
      <svg className={common} fill="none" viewBox="0 0 24 24">
        <path d="M4 19h16M7 17v-4m5 4V7m5 10v-7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        <circle cx="7" cy="11" r="1.2" fill="currentColor" />
        <circle cx="12" cy="5" r="1.2" fill="currentColor" />
        <circle cx="17" cy="10" r="1.2" fill="currentColor" />
      </svg>
    );
  }

  if (icon === "accounting") {
    return (
      <svg className={common} fill="none" viewBox="0 0 24 24">
        <path d="M6 4.5h8l4 4V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-12.5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
        <path d="M14 4.5V8.5H18M8 12h8M8 16h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
      </svg>
    );
  }

  if (icon === "reports") {
    return (
      <svg className={common} fill="none" viewBox="0 0 24 24">
        <path d="M6 4.5h8l4 4V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-12.5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
        <path d="M8 13.5h8M8 17h6M14 4.5V8.5H18" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
      </svg>
    );
  }

  if (icon === "charts") {
    return (
      <svg className={common} fill="none" viewBox="0 0 24 24">
        <path d="M4 19h16M7 16l3-4 3 2 4-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        <circle cx="7" cy="16" r="1.2" fill="currentColor" />
        <circle cx="10" cy="12" r="1.2" fill="currentColor" />
        <circle cx="13" cy="14" r="1.2" fill="currentColor" />
        <circle cx="17" cy="8" r="1.2" fill="currentColor" />
      </svg>
    );
  }

  if (icon === "contacts") {
    return (
      <svg className={common} fill="none" viewBox="0 0 24 24">
        <path d="M7 18.5c.8-2.2 2.8-3.5 5-3.5s4.2 1.3 5 3.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        <circle cx="12" cy="9" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  if (icon === "audit") {
    return (
      <svg className={common} fill="none" viewBox="0 0 24 24">
        <path d="M8 4.5h8M9 3h6v3H9zM6.5 6.5h11A1.5 1.5 0 0 1 19 8v11A1.5 1.5 0 0 1 17.5 20h-11A1.5 1.5 0 0 1 5 19V8a1.5 1.5 0 0 1 1.5-1.5Z" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8.5 11h7M8.5 14.5h7M8.5 18h4.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
      </svg>
    );
  }

  if (icon === "settings") {
    return (
      <svg className={common} fill="none" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 4.5v2.2M12 17.3v2.2M4.5 12h2.2M17.3 12h2.2M6.7 6.7l1.6 1.6M15.7 15.7l1.6 1.6M17.3 6.7l-1.6 1.6M8.3 15.7l-1.6 1.6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (icon === "subscription") {
    return (
      <svg className={common} fill="none" viewBox="0 0 24 24">
        <rect x="3.5" y="6" width="17" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M3.5 10h17M8 14.5h4.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
      </svg>
    );
  }

  if (icon === "compliance") {
    return (
      <svg className={common} fill="none" viewBox="0 0 24 24">
        <path d="M6 4.5h8l4 4V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-12.5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
        <path d="m9 14 2 2 4.5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (icon === "hr") {
    return (
      <svg className={common} fill="none" viewBox="0 0 24 24">
        <circle cx="9" cy="9" r="2.8" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="16.5" cy="8.5" r="2.2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M4.8 18c.8-2.4 2.8-3.8 5.2-3.8s4.4 1.4 5.2 3.8M13.8 18c.5-1.7 1.9-2.8 3.7-2.8 1.7 0 3.1 1.1 3.7 2.8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
      </svg>
    );
  }

  if (icon === "task") {
    return (
      <svg className={common} fill="none" viewBox="0 0 24 24">
        <rect x="5" y="4.5" width="14" height="15" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <path d="m8.5 10 1.5 1.5 3-3M8.5 15h7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (icon === "apps") {
    return (
      <svg className={common} fill="none" viewBox="0 0 24 24">
        <rect x="4.5" y="4.5" width="5.5" height="5.5" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
        <rect x="14" y="4.5" width="5.5" height="5.5" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
        <rect x="4.5" y="14" width="5.5" height="5.5" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
        <rect x="14" y="14" width="5.5" height="5.5" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }

  return (
    <svg className={common} fill="none" viewBox="0 0 24 24">
      <path d="M5 7.5h14M5 12h14M5 16.5h14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <circle cx="7.5" cy="7.5" r="1" fill="currentColor" />
      <circle cx="7.5" cy="12" r="1" fill="currentColor" />
      <circle cx="7.5" cy="16.5" r="1" fill="currentColor" />
    </svg>
  );
}
