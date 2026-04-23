import React from "react";
import { notFound } from "next/navigation";

import { ModuleLandingPage } from "../../../components/module-landing-page";
import { resolveTenantRoute } from "../../../components/route-map";
import { renderAccountingSetupPage } from "../../../components/week2/accounting-pages";
import { renderContactsPage } from "../../../components/week2/contacts-pages";
import { renderSettingsPage } from "../../../components/week2/settings-pages";
import { renderWeek3AccountingPage } from "../../../components/week3/accounting-pages";
import { renderCompliancePage } from "../../../components/week3/compliance-page";
import { renderWeek4AccountingPage } from "../../../components/week4/accounting-pages";
import { renderBillingPage } from "../../../components/week4/billing-page";
import { renderAuditReportPage } from "../../../components/week5/audit-report-page";
import {
  renderAccountingOverviewPage,
  renderAccountingDashboardPage,
  renderHomePage,
  renderOrganisationStatsPage,
} from "../../../components/week6/shell-pages";
import { renderManualJournalsPage } from "../../../components/week7/manual-journals-page";
import { renderInventoryPage } from "../../../components/week8/inventory-page";
import {
  renderChartsSurface,
  renderReportsSurface
} from "../../../components/week9/reporting-pages";

export const dynamic = "force-dynamic";

export default async function TenantCatchAllPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; segments?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orgSlug, segments = [] } = await params;
  const resolvedSearchParams = await searchParams;

  if (segments.length === 0) {
    return renderHomePage(orgSlug);
  }

  if (segments[0] === "settings") {
    return renderSettingsPage(orgSlug, segments);
  }

  if (segments[0] === "contacts") {
    return renderContactsPage(orgSlug, segments);
  }

  if (
    segments[0] === "accounting" &&
    ["sales", "purchases"].includes(segments[1] ?? "") &&
    !["credit-notes", "repeating", "orders"].includes(segments[2] ?? "")
  ) {
    return renderWeek3AccountingPage(orgSlug, segments, resolvedSearchParams);
  }

  if (
    segments[0] === "accounting" &&
    ((segments[1] === "sales" &&
      ["credit-notes", "repeating"].includes(segments[2] ?? "")) ||
      (segments[1] === "purchases" &&
        ["credit-notes", "orders", "repeating"].includes(segments[2] ?? "")) ||
      segments[1] === "fixed-assets")
  ) {
    return renderWeek4AccountingPage(orgSlug, segments);
  }

  if (segments[0] === "accounting" && segments[1] === "quotes") {
    return renderWeek3AccountingPage(orgSlug, segments, resolvedSearchParams);
  }

  if (
    segments[0] === "accounting" &&
    segments[1] === "overview" &&
    segments.length === 2
  ) {
    return renderAccountingOverviewPage(orgSlug);
  }

  if (
    segments[0] === "accounting" &&
    segments[1] === "dashboard" &&
    segments.length === 2
  ) {
    return renderAccountingDashboardPage();
  }

  if (
    segments[0] === "accounting" &&
    segments[1] === "organisation-stats" &&
    segments.length === 2
  ) {
    return renderOrganisationStatsPage(orgSlug, resolvedSearchParams);
  }

  if (segments[0] === "accounting" && segments[1] === "manual-journals") {
    return renderManualJournalsPage(orgSlug, segments);
  }

  if (segments[0] === "accounting" && segments[1] === "inventory") {
    return renderInventoryPage(orgSlug, segments, resolvedSearchParams);
  }

  if (segments[0] === "e-invoice-integration") {
    return renderCompliancePage(orgSlug, {
      deadLetterSubmissionId:
        segments[1] === "dead-letter" && typeof segments[2] === "string"
          ? segments[2]
          : undefined,
    });
  }

  if (segments[0] === "reports") {
    return renderReportsSurface(orgSlug, segments, resolvedSearchParams);
  }

  if (segments[0] === "charts") {
    return renderChartsSurface(orgSlug, segments, resolvedSearchParams);
  }

  if (segments[0] === "subscription") {
    return renderBillingPage(orgSlug, segments);
  }

  if (segments[0] === "audit-report" && segments.length === 1) {
    return renderAuditReportPage(orgSlug, resolvedSearchParams);
  }

  const route = resolveTenantRoute(segments);

  if (!route) {
    notFound();
  }

  if (
    route.key === "accounting-bank-accounts" ||
    route.key === "accounting-chart-of-accounts"
  ) {
    return renderAccountingSetupPage(route.key);
  }

  return (
    <ModuleLandingPage
      description={route.description}
      orgSlug={orgSlug}
      title={route.title}
    />
  );
}
