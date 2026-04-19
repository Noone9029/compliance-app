import React from "react";

import { Card, CardContent } from "@daftar/ui";

const settingSections = [
  {
    key: "tax-rates",
    label: "Tax Rates",
    description: "Add, edit, and delete the tax rates you want to use.",
    icon: "tax"
  },
  {
    key: "organisation-tax-details",
    label: "Organisation Tax Details",
    description: "View your organisation taxes for submitting tax returns.",
    icon: "organisation"
  },
  {
    key: "tracking",
    label: "Tracking",
    description: "Manage tracking items for more powerful reporting.",
    icon: "tracking"
  },
  {
    key: "currencies",
    label: "Currencies",
    description: "Add foreign currencies that your organization uses.",
    icon: "currency"
  },
  {
    key: "invoice-settings",
    label: "Invoice Settings",
    description: "Add a custom header, footer and logo to your invoices.",
    icon: "invoice"
  },
  {
    key: "email-templates",
    label: "Email Templates",
    description: "Set email template content.",
    icon: "email"
  },
  {
    key: "custom-organisation-settings",
    label: "Custom Organisation Settings",
    description: "If you need to customize your organisation settings.",
    icon: "custom"
  },
  {
    key: "team-access",
    label: "Team & Access",
    description: "Manage members, invitations, and role-based access for your organization.",
    icon: "team"
  },
  {
    key: "connector-settings",
    label: "Connector Settings",
    description: "Review connector account state, export readiness, and recorded activity.",
    icon: "connector"
  }
] as const;

function SettingIcon({
  icon
}: {
  icon: (typeof settingSections)[number]["icon"];
}) {
  const shared = "h-8 w-8 text-emerald-500";

  if (icon === "tax") {
    return (
      <svg className={shared} fill="none" viewBox="0 0 32 32">
        <circle cx="12" cy="16" r="6.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M9.5 16h5M12 13.5V19" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        <path d="M19 9.5c2-2 5.5-2 7.5 0s2 5.5 0 7.5-5.5 2-7.5 0-2-5.5 0-7.5Z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M22.75 11.5v4.75M20.4 13.9h4.7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (icon === "organisation") {
    return (
      <svg className={shared} fill="none" viewBox="0 0 32 32">
        <path d="M8 24V10.5A2.5 2.5 0 0 1 10.5 8h11A2.5 2.5 0 0 1 24 10.5V24" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 13h8M12 17h8M12 21h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        <path d="m20 8 2-3m-8 3-2-3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (icon === "tracking") {
    return (
      <svg className={shared} fill="none" viewBox="0 0 32 32">
        <path d="M16 26s7-6.1 7-12.1A7 7 0 1 0 9 13.9C9 19.9 16 26 16 26Z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12.5 14.5h7M12.5 18h4.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (icon === "currency") {
    return (
      <svg className={shared} fill="none" viewBox="0 0 32 32">
        <circle cx="12" cy="11" r="4.5" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="21.5" cy="20.5" r="4.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M15.5 13.5 18 16M14.5 19.5h3M9.5 9.5h5M12 7v8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (icon === "invoice") {
    return (
      <svg className={shared} fill="none" viewBox="0 0 32 32">
        <path d="M10 6h8l4 4v16H10z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
        <path d="M18 6v4h4M13 15h6M13 19h6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        <circle cx="12.5" cy="24" r="3.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M11.1 24h2.8M12.5 22.6v2.8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (icon === "email") {
    return (
      <svg className={shared} fill="none" viewBox="0 0 32 32">
        <rect height="16" rx="2.5" stroke="currentColor" strokeWidth="1.8" width="20" x="6" y="8" />
        <path d="m8.5 11.5 7.5 6 7.5-6" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
        <path d="m11 20.5 3.5-3m6 0 3.5 3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (icon === "custom") {
    return (
      <svg className={shared} fill="none" viewBox="0 0 32 32">
        <path d="M10 5h12v22H10z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M13 10h6M13 14h6M13 18h6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        <circle cx="20.5" cy="24.5" r="3.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="m20.5 22.6 1.1 1.1-1.1 4.3-1.1-4.3 1.1-1.1Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.4" />
      </svg>
    );
  }

  if (icon === "team") {
    return (
      <svg className={shared} fill="none" viewBox="0 0 32 32">
        <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="21.5" cy="13.5" r="3.5" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M6.5 24c.9-3 3.4-4.8 6.5-4.8s5.6 1.8 6.5 4.8M18.2 23.8c.5-2.1 2.2-3.5 4.4-3.5 1.4 0 2.7.6 3.6 1.7"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  return (
    <svg className={shared} fill="none" viewBox="0 0 32 32">
      <rect height="18" rx="3" stroke="currentColor" strokeWidth="1.8" width="20" x="6" y="7" />
      <path d="M10 13h12M10 18h8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <circle cx="22" cy="22" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function SettingsHub({ orgSlug }: { orgSlug: string }) {
  return (
    <div className="space-y-6">
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="space-y-6 px-6 py-8 sm:px-10">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-600">
              Settings
            </p>
            <h2 className="text-4xl font-semibold tracking-tight text-slate-950">
              Accounting Settings
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-slate-500">
              Configure the accounting, tax, invoicing, access, and connector
              settings used across this workspace.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {settingSections.map((section) => (
              <a
                className="group rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
                href={`/${orgSlug}/settings/${section.key}`}
                key={section.key}
              >
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl bg-emerald-50 p-3 transition group-hover:bg-emerald-100">
                    <SettingIcon icon={section.icon} />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <h3 className="text-lg font-semibold text-emerald-700">
                      {section.label}
                    </h3>
                    <p className="text-sm leading-6 text-slate-500">
                      {section.description}
                    </p>
                    <p className="text-sm font-medium text-slate-900">Open settings</p>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
