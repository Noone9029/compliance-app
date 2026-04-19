import React from "react";
import type { ChartPointRecord } from "@daftar/types";
import { Button, Card, CardContent, CardHeader } from "@daftar/ui";

import { money } from "../week3/shared";

export type TenantSearchParams = Record<string, string | string[] | undefined>;

export type NavSection<TKey extends string> = {
  title: string;
  items: Array<{
    key: TKey;
    label: string;
    path: string;
    description: string;
    aliases?: string[];
  }>;
};

export function resolveRouteKey<TKey extends string>(
  path: string,
  sections: NavSection<TKey>[]
) {
  const normalized = path.trim().replace(/^\/+|\/+$/g, "");

  for (const section of sections) {
    for (const item of section.items) {
      const matches = [item.path, ...(item.aliases ?? [])].map((value) =>
        value.replace(/^\/+|\/+$/g, "")
      );

      if (matches.includes(normalized)) {
        return item.key;
      }
    }
  }

  return null;
}

export function getPageQuery(searchParams: TenantSearchParams) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);

  return {
    from: firstParam(searchParams.from) ?? monthStart,
    to: firstParam(searchParams.to) ?? monthEnd,
    search: (firstParam(searchParams.search) ?? "").trim(),
    year: Number(firstParam(searchParams.year) ?? now.getUTCFullYear()),
    contactId: firstParam(searchParams.contactId) ?? "",
    reportType: firstParam(searchParams.reportType) ?? "all",
    includePrepayments: firstParam(searchParams.includePrepayments) === "true",
    statuses: toList(searchParams.status),
    salesTaxView: firstParam(searchParams.salesTaxView) ?? "summary",
    showByTaxRate: firstParam(searchParams.showByTaxRate) === "true",
    showByTaxComponent: firstParam(searchParams.showByTaxComponent) === "true",
    showByAccountType: firstParam(searchParams.showByAccountType) === "true"
  };
}

export function withDateQuery(path: string, query: ReturnType<typeof getPageQuery>) {
  const params = new URLSearchParams();
  params.set("from", query.from);
  params.set("to", query.to);
  return `${path}?${params.toString()}`;
}

export function withPageQuery(query: ReturnType<typeof getPageQuery>) {
  const params = new URLSearchParams();
  params.set("from", query.from);
  params.set("to", query.to);

  if (query.search) {
    params.set("search", query.search);
  }

  if (query.year) {
    params.set("year", String(query.year));
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function toList(value: string | string[] | undefined) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((entry) => entry.trim()).filter(Boolean);
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function AccessCard({
  title,
  message
}: {
  title: string;
  message: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="text-sm text-slate-500">{message}</p>
        </div>
      </CardHeader>
    </Card>
  );
}

export function SecondaryRouteLayout<TKey extends string>({
  title,
  sections,
  prefix,
  orgSlug,
  activeKey,
  children
}: {
  title: string;
  sections: NavSection<TKey>[];
  prefix: string;
  orgSlug: string;
  activeKey: TKey;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside>
        <Card className="xl:sticky xl:top-6">
          <CardContent className="space-y-6 py-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                {title}
              </p>
            </div>
            {sections.map((section) => (
              <div className="space-y-2" key={section.title}>
                <p className="text-sm font-semibold text-slate-700">{section.title}</p>
                <div className="space-y-1.5">
                  {section.items.map((item) => {
                    const href = item.path
                      ? `/${orgSlug}/${prefix}/${item.path}`
                      : `/${orgSlug}/${prefix}`;

                    return (
                      <a
                        className={
                          item.key === activeKey
                            ? "block rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white"
                            : "block rounded-xl px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                        }
                        href={href}
                        key={href}
                      >
                        {item.label}
                      </a>
                    );
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </aside>
      <div className="space-y-6">{children}</div>
    </div>
  );
}

export function PageIntro({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
      </CardHeader>
    </Card>
  );
}

export function DateFilterCard({
  query,
  actionLabel,
  includeYear = false
}: {
  query: ReturnType<typeof getPageQuery>;
  actionLabel: string;
  includeYear?: boolean;
}) {
  return (
    <Card>
      <CardContent className="py-6">
        <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto] xl:grid-cols-[1fr_1fr_auto_auto]" method="GET">
          <FilterField label="From Date" name="from" type="date" value={query.from} />
          <FilterField label="To Date" name="to" type="date" value={query.to} />
          {includeYear ? (
            <FilterField
              label="Year"
              name="year"
              type="number"
              value={String(query.year)}
            />
          ) : null}
          <div className="flex items-end">
            <Button className="w-full bg-emerald-600 hover:bg-emerald-500" type="submit">
              {actionLabel}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function SearchFilterCard({ query }: { query: ReturnType<typeof getPageQuery> }) {
  return (
    <form className="grid gap-3 md:grid-cols-[1fr_auto]" method="GET">
      <input name="from" type="hidden" value={query.from} />
      <input name="to" type="hidden" value={query.to} />
      <input name="year" type="hidden" value={String(query.year)} />
      <FilterField label="Search" name="search" type="text" value={query.search} />
      <div className="flex items-end">
        <Button className="w-full bg-slate-800 hover:bg-slate-700" type="submit">
          Search
        </Button>
      </div>
    </form>
  );
}

function FilterField({
  label,
  name,
  type,
  value
}: {
  label: string;
  name: string;
  type: string;
  value: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
        defaultValue={value}
        name={name}
        type={type}
      />
    </label>
  );
}

export function MetricGrid({
  items
}: {
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="space-y-2 py-5">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
              {item.label}
            </p>
            <p className="text-2xl font-semibold text-slate-900">{item.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function LaunchCardGrid<TKey extends string>({
  sections,
  prefix,
  orgSlug
}: {
  sections: NavSection<TKey>[];
  prefix: string;
  orgSlug: string;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {sections.map((section) => (
        <Card key={section.title}>
          <CardHeader>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">{section.title}</h2>
              <p className="text-sm text-slate-500">
                Direct routes for the remaining {prefix} surfaces.
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {section.items.map((item) => (
              <a
                className="block rounded-2xl border border-slate-200 px-4 py-3 transition hover:border-slate-300 hover:bg-slate-50"
                href={`/${orgSlug}/${prefix}${item.path ? `/${item.path}` : ""}`}
                key={item.key}
              >
                <p className="font-medium text-slate-900">{item.label}</p>
                <p className="mt-1 text-sm text-slate-500">{item.description}</p>
              </a>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function DownloadAction({
  label,
  filename,
  columns,
  rows
}: {
  label: string;
  filename: string;
  columns: Array<string | number>;
  rows: Array<Array<string | number>>;
}) {
  const href = buildCsvDataUri(columns, rows);

  return (
    <a
      className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
      download={filename}
      href={href}
    >
      {label}
    </a>
  );
}

export function DataTable({
  columns,
  rows
}: {
  columns: string[];
  rows: string[][];
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">No rows match the current filters.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead>
          <tr className="text-left text-slate-500">
            {columns.map((column) => (
              <th className="px-3 py-2 font-medium" key={column}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`}>
              {row.map((value, cellIndex) => (
                <td className="px-3 py-3 align-top" key={`row-${rowIndex}-${cellIndex}`}>
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatementSections({
  sections
}: {
  sections: Array<{
    title: string;
    total: string;
    lines: Array<{ label: string; value: string }>;
  }>;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      {sections.map((section) => (
        <Card key={section.title}>
          <CardHeader>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">{section.title}</h2>
              <p className="text-sm text-slate-500">Total {money(section.total)}</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {section.lines.length === 0 ? (
              <p className="text-sm text-slate-500">No ledger lines in this section yet.</p>
            ) : (
              section.lines.map((line) => (
                <div className="flex items-center justify-between gap-3" key={line.label}>
                  <p className="text-sm text-slate-600">{line.label}</p>
                  <p className="font-medium text-slate-900">{money(line.value)}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ActionLinkCard({
  title,
  subtitle,
  label,
  href
}: {
  title: string;
  subtitle: string;
  label: string;
  href: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
        <div className="space-y-1">
          <p className="font-medium text-slate-900">{title}</p>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
        <a
          className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
          href={href}
        >
          {label}
        </a>
      </CardContent>
    </Card>
  );
}

export function BarChart({ points }: { points: ChartPointRecord[] }) {
  const max = Math.max(...points.map((point) => Math.abs(Number(point.value))), 1);

  return (
    <div className="space-y-4">
      {points.map((point) => {
        const numeric = Number(point.value);
        const width = `${Math.max((Math.abs(numeric) / max) * 100, 6)}%`;

        return (
          <div className="space-y-2" key={point.label}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-slate-800">{point.label}</span>
              <span className="text-slate-500">{money(point.value)}</span>
            </div>
            <div className="h-4 overflow-hidden rounded-full bg-slate-100">
              <div
                className={numeric < 0 ? "h-full rounded-full bg-rose-400" : "h-full rounded-full bg-sky-400"}
                style={{ width }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DualSeriesChart({
  points
}: {
  points: Array<{
    label: string;
    primaryLabel: string;
    primaryValue: string;
    secondaryLabel: string;
    secondaryValue: string;
  }>;
}) {
  const max = Math.max(
    ...points.flatMap((point) => [
      Number(point.primaryValue),
      Number(point.secondaryValue)
    ]),
    1
  );

  return (
    <div className="space-y-4">
      {points.map((point) => (
        <div className="space-y-2 rounded-2xl border border-slate-200 p-4" key={point.label}>
          <p className="font-medium text-slate-800">{point.label}</p>
          <SeriesBar
            label={point.primaryLabel}
            max={max}
            tone="sky"
            value={point.primaryValue}
          />
          <SeriesBar
            label={point.secondaryLabel}
            max={max}
            tone="amber"
            value={point.secondaryValue}
          />
        </div>
      ))}
    </div>
  );
}

function SeriesBar({
  label,
  value,
  max,
  tone
}: {
  label: string;
  value: string;
  max: number;
  tone: "sky" | "amber";
}) {
  const width = `${Math.max((Number(value) / max) * 100, 6)}%`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="text-slate-500">{money(value)}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
        <div
          className={tone === "amber" ? "h-full rounded-full bg-amber-400" : "h-full rounded-full bg-sky-400"}
          style={{ width }}
        />
      </div>
    </div>
  );
}

export function DonutBreakdown({ points }: { points: ChartPointRecord[] }) {
  const total = Math.max(
    points.reduce((sum, point) => sum + Number(point.value), 0),
    1
  );
  const tones = ["#f472b6", "#fb7185", "#c084fc", "#fbbf24", "#38bdf8"];
  let cursor = 0;
  const segments = points.map((point, index) => {
    const ratio = Number(point.value) / total;
    const start = cursor;
    const end = cursor + ratio * 100;
    cursor = end;
    return `${tones[index % tones.length]} ${start}% ${end}%`;
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[220px_minmax(0,1fr)] xl:items-center">
      <div className="mx-auto flex h-52 w-52 items-center justify-center rounded-full bg-slate-100">
        <div
          className="flex h-44 w-44 items-center justify-center rounded-full"
          style={{
            background: `conic-gradient(${segments.join(", ")})`
          }}
        >
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white text-center text-sm font-medium text-slate-700">
            {money(total)}
          </div>
        </div>
      </div>
      <div className="space-y-3">
        {points.map((point, index) => (
          <div className="flex items-center justify-between gap-3" key={point.label}>
            <div className="flex items-center gap-3">
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: tones[index % tones.length] }}
              />
              <span className="text-sm text-slate-700">{point.label}</span>
            </div>
            <span className="text-sm font-medium text-slate-900">{money(point.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildCsvDataUri(
  columns: Array<string | number>,
  rows: Array<Array<string | number>>
) {
  const csv = [columns, ...rows]
    .map((row) => row.map((cell) => escapeCsvCell(cell)).join(","))
    .join("\n");

  return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
}

function escapeCsvCell(value: string | number) {
  const normalized = String(value ?? "");

  if (!/[",\n]/.test(normalized)) {
    return normalized;
  }

  return `"${normalized.replaceAll('"', '""')}"`;
}
