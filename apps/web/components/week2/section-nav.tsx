import React from "react";

import { Card, CardContent } from "@daftar/ui";

type SectionNavItem = {
  href: string;
  label: string;
  active: boolean;
};

export function SectionNav({
  title,
  items
}: {
  title: string;
  items: SectionNavItem[];
}) {
  return (
    <Card className="border-slate-100">
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
            {title}
          </p>
          <p className="text-sm text-slate-500">
            Navigate across the active section without dropping back to the workspace home.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-2">
          {items.map((item) => (
            <a
              className={
                item.active
                  ? "rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-900"
                  : "rounded-2xl border border-transparent bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:border-slate-200 hover:bg-white hover:text-slate-950"
              }
              href={item.href}
              key={item.href}
            >
              {item.label}
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
