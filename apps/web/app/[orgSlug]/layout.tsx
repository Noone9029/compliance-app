import { redirect } from "next/navigation";

import type { CapabilitySnapshot } from "@daftar/types";

import { createServerPlatformClient } from "../../components/api";
import { OrgSwitcher } from "../../components/org-switcher";
import { tenantRoutes } from "../../components/route-map";
import { TenantShell } from "../../components/tenant-shell";
import type { NavIconKey } from "../../components/tenant-shell";

export const dynamic = "force-dynamic";

export default async function TenantLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const client = await createServerPlatformClient();
  const session = await client.session().catch(() => null);

  if (!session?.authenticated) {
    redirect("/sign-in");
  }

  const capabilities: CapabilitySnapshot = await client
    .capabilities()
    .catch(() => ({ roleKey: null, permissions: [] }));
  const currentOrganization = await client.currentOrganization().catch(() => null);
  const organizations = await client.organizations().catch(() => []);

  if (currentOrganization?.slug && currentOrganization.slug !== orgSlug) {
    redirect(`/${currentOrganization.slug}`);
  }

  const routeMap = new Map(tenantRoutes.map((route) => [route.key, route]));
  const navBlueprint: Array<{
    key: string;
    label: string;
    icon: NavIconKey;
    matchPrefixes: string[];
    exact?: boolean;
  }> = [
    { key: "home", label: "Overview", icon: "overview", matchPrefixes: [`/${orgSlug}`], exact: true },
    {
      key: "accounting-dashboard",
      label: "Dashboard",
      icon: "dashboard",
      matchPrefixes: [`/${orgSlug}/accounting/dashboard`]
    },
    {
      key: "accounting-organisation-stats",
      label: "Organisation Stats",
      icon: "stats",
      matchPrefixes: [`/${orgSlug}/accounting/organisation-stats`]
    },
    {
      key: "accounting-overview",
      label: "Accounting",
      icon: "accounting",
      matchPrefixes: [`/${orgSlug}/accounting`]
    },
    { key: "reports", label: "Reports", icon: "reports", matchPrefixes: [`/${orgSlug}/reports`] },
    { key: "charts", label: "Charts", icon: "charts", matchPrefixes: [`/${orgSlug}/charts`] },
    {
      key: "contacts",
      label: "Contacts",
      icon: "contacts",
      matchPrefixes: [`/${orgSlug}/contacts`]
    },
    {
      key: "audit-report",
      label: "Audit Report",
      icon: "audit",
      matchPrefixes: [`/${orgSlug}/audit-report`]
    },
    {
      key: "settings",
      label: "Settings",
      icon: "settings",
      matchPrefixes: [`/${orgSlug}/settings`]
    }
  ];
  const navItems = navBlueprint
    .map((item) => {
      const route = routeMap.get(item.key);

      if (!route || !capabilities.permissions.includes(route.requiredPermission)) {
        return null;
      }

      return {
        key: item.key,
        label: item.label,
        href: route.href(orgSlug),
        icon: item.icon,
        matchPrefixes: item.matchPrefixes,
        exact: item.exact
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const moduleBlueprint: Array<{
    key: string;
    label: string;
    icon: NavIconKey;
    matchPrefixes: string[];
  }> = [
    { key: "e-invoice", label: "E-Invoice", icon: "compliance", matchPrefixes: [`/${orgSlug}/e-invoice-integration`] },
    { key: "subscription", label: "Subscription", icon: "subscription", matchPrefixes: [`/${orgSlug}/subscription`] },
    { key: "hr-payroll", label: "HR & Payroll", icon: "hr", matchPrefixes: [`/${orgSlug}/hr-payroll`] },
    { key: "task-management", label: "Task Management", icon: "task", matchPrefixes: [`/${orgSlug}/task-management`] },
    { key: "applications", label: "Applications", icon: "apps", matchPrefixes: [`/${orgSlug}/applications`] },
    { key: "list-tracking", label: "List Tracking", icon: "list", matchPrefixes: [`/${orgSlug}/list-tracking`] }
  ];
  const moduleItems = moduleBlueprint
    .map((item) => {
      const route = routeMap.get(item.key);

      if (!route || !capabilities.permissions.includes(route.requiredPermission)) {
        return null;
      }

      return {
        key: item.key,
        label: item.label,
        href: route.href(orgSlug),
        icon: item.icon,
        matchPrefixes: item.matchPrefixes
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return (
    <TenantShell
      headerActions={
        currentOrganization ? (
          <OrgSwitcher
            currentOrgSlug={currentOrganization.slug}
            organizations={organizations}
          />
        ) : null
      }
      moduleItems={moduleItems}
      navItems={navItems}
      orgName={currentOrganization?.name ?? orgSlug}
      orgSlug={orgSlug}
    >
      {children}
    </TenantShell>
  );
}
