import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  fetchServerJson: vi.fn(async (endpoint: string) => {
    if (endpoint === "/v1/billing/summary") {
      return {
        stripeCustomerId: "cus_123",
        billingEmail: "finance@example.com",
        subscriptionId: "sub_123",
        planCode: "GROWTH",
        status: "ACTIVE",
        seats: 8,
        currentPeriodStart: "2026-05-01T00:00:00.000Z",
        currentPeriodEnd: "2026-05-31T23:59:59.000Z",
        cancelAtPeriodEnd: false
      };
    }

    if (endpoint === "/v1/billing/plans") {
      return [
        {
          code: "GROWTH",
          name: "Growth",
          description: "Scaled plan for growing multi-user accounting operations.",
          monthlyPrice: "299.00",
          currencyCode: "USD",
          includedSeats: 10,
          addOns: ["Extra seats", "Priority support", "Advanced exports"]
        }
      ];
    }

    if (endpoint === "/v1/setup/organisation-tax-details") {
      return {
        legalName: "Nomad Arabia Limited",
        taxNumber: "300000000000003",
        countryCode: "SA",
        taxOffice: "Riyadh",
        registrationNumber: "CR-12345",
        addressLine1: "Innovation Boulevard",
        addressLine2: "Al Aqeeq District",
        city: "Riyadh",
        postalCode: "13519"
      };
    }

    return [
      {
        id: "invoice_1",
        organizationId: "org_1",
        stripeSubscriptionId: "sub_123",
        stripeInvoiceId: "in_123",
        invoiceNumber: "SUB-0001",
        status: "paid",
        total: "299.00",
        currencyCode: "USD",
        issuedAt: "2026-05-01T00:00:00.000Z",
        dueAt: "2026-05-05T00:00:00.000Z",
        paidAt: "2026-05-03T00:00:00.000Z",
        hostedInvoiceUrl: "https://billing.example.test/invoices/SUB-0001",
        createdAt: "2026-05-01T00:00:00.000Z"
      }
    ];
  })
}));

vi.mock("../week2/route-utils", () => ({
  getCapabilities: vi.fn(async () => ({
    roleKey: "OWNER",
    permissions: ["billing.read"]
  })),
  hasPermission: vi.fn(
    (capabilities: { permissions: string[] }, permission: string) =>
      capabilities.permissions.includes(permission)
  )
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound");
  })
}));

import { renderBillingPage } from "./billing-page";

describe("billing page", () => {
  it("renders a read-only subscription summary without self-service controls", async () => {
    render(await renderBillingPage("nomad-events", ["subscription"]));

    expect(
      screen.getAllByText("Subscription Plan Details").length
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText(/self-service subscription changes are not enabled here/i)
    ).toBeTruthy();
    expect(screen.queryByText("Upgrade Plan")).toBeNull();
    expect(screen.queryByText("Edit")).toBeNull();
  });

  it("renders plan entitlements from recorded billing state only", async () => {
    render(await renderBillingPage("nomad-events", ["subscription", "add-ons"]));

    expect(screen.getByText("Plan Entitlements")).toBeTruthy();
    expect(screen.getByText("Priority support")).toBeTruthy();
    expect(screen.getByText("Additional Add-Ons")).toBeTruthy();
    expect(screen.queryByText("Languages")).toBeNull();
    expect(screen.queryByText("Modules")).toBeNull();
  });

  it("renders invoice history without customer-created billing actions", async () => {
    render(await renderBillingPage("nomad-events", ["subscription", "invoices"]));

    expect(screen.getByText("Billing Invoices")).toBeTruthy();
    expect(screen.getByText("SUB-0001")).toBeTruthy();
    expect(screen.getByText("Open hosted invoice")).toBeTruthy();
    expect(screen.queryByText("Create Invoice")).toBeNull();
  });
});
