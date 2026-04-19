import { describe, expect, it } from "vitest";

import { resolveTenantRoute, tenantRoutes } from "./route-map";

describe("tenant route map", () => {
  it("covers all locked week 1 paths", () => {
    const orgSlug = "nomad-events";
    const expectedPaths = [
      `/${orgSlug}`,
      `/${orgSlug}/accounting/overview`,
      `/${orgSlug}/accounting/dashboard`,
      `/${orgSlug}/accounting/organisation-stats`,
      `/${orgSlug}/accounting/sales`,
      `/${orgSlug}/accounting/purchases`,
      `/${orgSlug}/accounting/quotes`,
      `/${orgSlug}/accounting/bank-accounts`,
      `/${orgSlug}/accounting/chart-of-accounts`,
      `/${orgSlug}/accounting/inventory`,
      `/${orgSlug}/accounting/fixed-assets`,
      `/${orgSlug}/accounting/manual-journals`,
      `/${orgSlug}/e-invoice-integration`,
      `/${orgSlug}/reports`,
      `/${orgSlug}/charts`,
      `/${orgSlug}/contacts`,
      `/${orgSlug}/audit-report`,
      `/${orgSlug}/settings`,
      `/${orgSlug}/hr-payroll`,
      `/${orgSlug}/subscription`,
      `/${orgSlug}/task-management`,
      `/${orgSlug}/applications`,
      `/${orgSlug}/list-tracking`
    ];

    expect(tenantRoutes.map((route) => route.href(orgSlug))).toEqual(expectedPaths);
  });

  it("resolves nested paths through the catch-all route", () => {
    expect(resolveTenantRoute([])?.title).toBe("Home");
    expect(resolveTenantRoute(["accounting", "sales"])?.title).toBe("Sales");
    expect(resolveTenantRoute(["debug", "session"])).toBeUndefined();
  });
});
