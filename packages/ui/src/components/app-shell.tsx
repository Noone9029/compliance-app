import type { ReactNode } from "react";

import { Card } from "./card";

export type NavItem = {
  label: string;
  href: string;
  visible?: boolean;
};

export function AppShell({
  orgName,
  orgSlug,
  pageTitle,
  headerActions,
  navItems,
  children
}: {
  orgName: string;
  orgSlug: string;
  pageTitle: string;
  headerActions?: ReactNode;
  navItems: NavItem[];
  children: ReactNode;
}) {
  const visibleItems = navItems.filter((item) => item.visible !== false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Daftar
            </p>
            <h1 className="text-lg font-semibold">{pageTitle}</h1>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium">{orgName}</p>
            <p className="text-xs text-slate-500">{orgSlug}</p>
          </div>
          {headerActions ? <div>{headerActions}</div> : null}
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-6 md:grid-cols-[260px_1fr]">
        <aside>
          <Card className="overflow-hidden">
            <nav className="flex flex-col">
              {visibleItems.map((item) => (
                <a
                  className="border-b border-slate-100 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </Card>
        </aside>
        <main>{children}</main>
      </div>
    </div>
  );
}
