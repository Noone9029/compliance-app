import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

import { EInvoiceIntegrationPanel } from "./einvoice-integration-panel";

describe("EInvoiceIntegrationPanel", () => {
  it("renders onboarding posture and compliance timeline", () => {
    render(
      <EInvoiceIntegrationPanel
        canWrite
        integration={{
          organizationName: "Nomad Events Arabia Limited",
          legalName: "Nomad Events Arabia Limited",
          taxNumber: "300123456700003",
          registrationNumber: "CR-1010998877",
          environment: "Sandbox",
          integrationDate: "2026-04-18T09:00:00.000Z",
          status: "REGISTERED",
          onboarding: {
            id: "onboarding_1",
            environment: "Sandbox",
            deviceName: "Nomad Events Arabia Limited EGS Unit",
            deviceSerial: "egs-nomad-events",
            status: "ACTIVE",
            certificateStatus: "ACTIVE",
            commonName: "Nomad Events Arabia Limited EGS Unit",
            egsSerialNumber: "egs-nomad-events",
            organizationUnitName: "Riyadh Operations",
            organizationName: "Nomad Events Arabia Limited",
            countryCode: "SA",
            vatNumber: "300123456700003",
            branchName: "Riyadh HQ",
            locationAddress: "Olaya Street, Office 402, Riyadh",
            industry: "Events",
            hasCsr: true,
            hasCertificate: true,
            csrGeneratedAt: "2026-04-18T08:45:00.000Z",
            otpReceivedAt: "2026-04-18T08:50:00.000Z",
            csrSubmittedAt: "2026-04-18T08:55:00.000Z",
            csid: "sandbox-nomad-events",
            certificateId: "cert-nomad-events",
            secretFingerprint: "abc123",
            certificateIssuedAt: "2026-04-18T09:00:00.000Z",
            certificateExpiresAt: "2027-04-18T09:00:00.000Z",
            lastActivatedAt: "2026-04-18T09:00:00.000Z",
            lastRenewedAt: "2026-04-18T09:00:00.000Z",
            revokedAt: null,
            lastError: null,
            createdAt: "2026-04-18T09:00:00.000Z",
            updatedAt: "2026-04-18T09:00:00.000Z",
          },
          timeline: [
            {
              id: "timeline_1",
              action: "compliance.integration.onboarded",
              status: "ACTIVE",
              message: "Device onboarding is active and ready for submissions.",
              createdAt: "2026-04-18T09:00:00.000Z",
            },
          ],
          mappings: [
            {
              bankAccountId: "bank_1",
              accountName: "Operating Account",
              paymentMeansCode: "30",
              paymentMeansLabel: "Credit Transfer",
            },
          ],
          availablePaymentMeans: [{ code: "30", label: "Credit Transfer" }],
        }}
      />,
    );

    expect(screen.getByText("Compliance Timeline")).toBeTruthy();
    expect(screen.getByText("compliance.integration.onboarded")).toBeTruthy();
    expect(
      screen.getByText((content, element) =>
        element?.textContent === "Device: Nomad Events Arabia Limited EGS Unit"
      )
    ).toBeTruthy();
    expect(screen.queryByText("Details")).toBeNull();
  });
});
