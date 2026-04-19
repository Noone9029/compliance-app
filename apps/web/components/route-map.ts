import type { PermissionKey } from "@daftar/types";

export type TenantRouteDefinition = {
  key: string;
  title: string;
  href: (orgSlug: string) => string;
  match: (segments: string[]) => boolean;
  requiredPermission: PermissionKey;
  description: string;
};

export const tenantRoutes: TenantRouteDefinition[] = [
  {
    key: "home",
    title: "Home",
    href: (orgSlug) => `/${orgSlug}`,
    match: (segments) => segments.length === 0,
    requiredPermission: "shell.home.read",
    description: "Workspace home for launching the main modules."
  },
  {
    key: "accounting-overview",
    title: "Accounting Overview",
    href: (orgSlug) => `/${orgSlug}/accounting/overview`,
    match: (segments) => segments.join("/") === "accounting/overview",
    requiredPermission: "shell.accounting.read",
    description: "Entry point for accounting workflows."
  },
  {
    key: "accounting-dashboard",
    title: "Accounting Dashboard",
    href: (orgSlug) => `/${orgSlug}/accounting/dashboard`,
    match: (segments) => segments.join("/") === "accounting/dashboard",
    requiredPermission: "shell.accounting.read",
    description: "Accounting dashboard with financial overview cards."
  },
  {
    key: "accounting-organisation-stats",
    title: "Organisation Stats",
    href: (orgSlug) => `/${orgSlug}/accounting/organisation-stats`,
    match: (segments) => segments.join("/") === "accounting/organisation-stats",
    requiredPermission: "shell.accounting.read",
    description: "Organisation-level activity and membership reporting."
  },
  {
    key: "accounting-sales",
    title: "Sales",
    href: (orgSlug) => `/${orgSlug}/accounting/sales`,
    match: (segments) => segments.join("/") === "accounting/sales",
    requiredPermission: "shell.accounting.read",
    description: "Sales invoices and receivables workspace."
  },
  {
    key: "accounting-purchases",
    title: "Purchases",
    href: (orgSlug) => `/${orgSlug}/accounting/purchases`,
    match: (segments) => segments.join("/") === "accounting/purchases",
    requiredPermission: "shell.accounting.read",
    description: "Purchases and payables workspace."
  },
  {
    key: "accounting-quotes",
    title: "Quotes",
    href: (orgSlug) => `/${orgSlug}/accounting/quotes`,
    match: (segments) => segments.join("/") === "accounting/quotes",
    requiredPermission: "shell.accounting.read",
    description: "Quotation workflow entry point."
  },
  {
    key: "accounting-bank-accounts",
    title: "Bank Accounts",
    href: (orgSlug) => `/${orgSlug}/accounting/bank-accounts`,
    match: (segments) => segments.join("/") === "accounting/bank-accounts",
    requiredPermission: "shell.accounting.read",
    description: "Bank account setup and balance management."
  },
  {
    key: "accounting-chart-of-accounts",
    title: "Chart of Accounts",
    href: (orgSlug) => `/${orgSlug}/accounting/chart-of-accounts`,
    match: (segments) => segments.join("/") === "accounting/chart-of-accounts",
    requiredPermission: "shell.accounting.read",
    description: "Chart of accounts maintenance."
  },
  {
    key: "accounting-inventory",
    title: "Inventory",
    href: (orgSlug) => `/${orgSlug}/accounting/inventory`,
    match: (segments) => segments.join("/") === "accounting/inventory",
    requiredPermission: "shell.accounting.read",
    description: "Inventory control and item management."
  },
  {
    key: "accounting-fixed-assets",
    title: "Fixed Assets",
    href: (orgSlug) => `/${orgSlug}/accounting/fixed-assets`,
    match: (segments) => segments.join("/") === "accounting/fixed-assets",
    requiredPermission: "shell.accounting.read",
    description: "Fixed asset register and depreciation."
  },
  {
    key: "accounting-manual-journals",
    title: "Manual Journals",
    href: (orgSlug) => `/${orgSlug}/accounting/manual-journals`,
    match: (segments) => segments.join("/") === "accounting/manual-journals",
    requiredPermission: "shell.accounting.read",
    description: "Manual journal entry workspace."
  },
  {
    key: "e-invoice",
    title: "E-Invoice Integration",
    href: (orgSlug) => `/${orgSlug}/e-invoice-integration`,
    match: (segments) => segments.join("/") === "e-invoice-integration",
    requiredPermission: "shell.e_invoice.read",
    description: "E-invoice integration and compliance setup."
  },
  {
    key: "reports",
    title: "Reports",
    href: (orgSlug) => `/${orgSlug}/reports`,
    match: (segments) => segments.join("/") === "reports",
    requiredPermission: "shell.reports.read",
    description: "Reporting workspace."
  },
  {
    key: "charts",
    title: "Charts",
    href: (orgSlug) => `/${orgSlug}/charts`,
    match: (segments) => segments.join("/") === "charts",
    requiredPermission: "shell.charts.read",
    description: "Financial charting workspace."
  },
  {
    key: "contacts",
    title: "Contacts",
    href: (orgSlug) => `/${orgSlug}/contacts`,
    match: (segments) => segments.join("/") === "contacts",
    requiredPermission: "shell.contacts.read",
    description: "Customer, supplier, and contact management."
  },
  {
    key: "audit-report",
    title: "Audit Report",
    href: (orgSlug) => `/${orgSlug}/audit-report`,
    match: (segments) => segments.join("/") === "audit-report",
    requiredPermission: "shell.audit_report.read",
    description: "Audit reporting and activity review."
  },
  {
    key: "settings",
    title: "Settings",
    href: (orgSlug) => `/${orgSlug}/settings`,
    match: (segments) => segments.join("/") === "settings",
    requiredPermission: "shell.settings.read",
    description: "Workspace settings and operational defaults."
  },
  {
    key: "hr-payroll",
    title: "HR & Payroll",
    href: (orgSlug) => `/${orgSlug}/hr-payroll`,
    match: (segments) => segments.join("/") === "hr-payroll",
    requiredPermission: "shell.hr_payroll.read",
    description: "Workspace entry point for HR and payroll operations."
  },
  {
    key: "subscription",
    title: "Subscription",
    href: (orgSlug) => `/${orgSlug}/subscription`,
    match: (segments) => segments.join("/") === "subscription",
    requiredPermission: "shell.subscription.read",
    description: "Subscription and billing management."
  },
  {
    key: "task-management",
    title: "Task Management",
    href: (orgSlug) => `/${orgSlug}/task-management`,
    match: (segments) => segments.join("/") === "task-management",
    requiredPermission: "shell.task_management.read",
    description: "Workspace entry point for task management."
  },
  {
    key: "applications",
    title: "Applications",
    href: (orgSlug) => `/${orgSlug}/applications`,
    match: (segments) => segments.join("/") === "applications",
    requiredPermission: "shell.applications.read",
    description: "Workspace entry point for installed applications."
  },
  {
    key: "list-tracking",
    title: "List Tracking",
    href: (orgSlug) => `/${orgSlug}/list-tracking`,
    match: (segments) => segments.join("/") === "list-tracking",
    requiredPermission: "shell.list_tracking.read",
    description: "Workspace entry point for list tracking."
  }
];

export function resolveTenantRoute(segments: string[]) {
  return tenantRoutes.find((route) => route.match(segments));
}
