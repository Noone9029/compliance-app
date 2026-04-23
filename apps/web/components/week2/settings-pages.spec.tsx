import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { fetchServerJson, getCapabilities } = vi.hoisted(() => ({
  fetchServerJson: vi.fn(async (endpoint: string) => {
    if (endpoint === "/v1/memberships/team") {
      return [
        {
          id: "member_1",
          userId: "user_1",
          fullName: "Daftar Owner",
          email: "owner@daftar.local",
          roleKey: "OWNER",
          status: "ACTIVE",
          createdAt: "2026-04-01T00:00:00.000Z",
          updatedAt: "2026-04-10T00:00:00.000Z",
          isCurrentUser: true,
          isLastActiveOwner: false
        }
      ];
    }

    if (endpoint === "/v1/connectors/accounts") {
      return [
        {
          id: "connector_1",
          organizationId: "org_1",
          provider: "XERO",
          displayName: "Nomad Events Xero",
          status: "CONNECTED",
          externalTenantId: "tenant_123",
          scopes: ["contacts", "invoices"],
          connectedAt: "2026-04-01T00:00:00.000Z",
          lastSyncedAt: "2026-04-12T00:00:00.000Z",
          createdAt: "2026-04-01T00:00:00.000Z",
          updatedAt: "2026-04-12T00:00:00.000Z"
        }
      ];
    }

    if (endpoint === "/v1/connectors/logs") {
      return [
        {
          id: "log_1",
          organizationId: "org_1",
          connectorAccountId: "connector_1",
          direction: "EXPORT",
          scope: "contacts",
          status: "FAILED",
          retryable: true,
          message: "Transport not enabled",
          startedAt: "2026-04-12T10:00:00.000Z",
          finishedAt: "2026-04-12T10:01:00.000Z",
          createdAt: "2026-04-12T10:00:00.000Z"
        }
      ];
    }

    if (endpoint === "/v1/connectors/accounts/connector_1/export-preview") {
      return {
        connectorAccountId: "connector_1",
        provider: "XERO",
        direction: "EXPORT",
        scopes: [
          { scope: "contacts", recordCount: 8 },
          { scope: "invoices", recordCount: 4 }
        ],
        generatedAt: "2026-04-12T10:00:00.000Z"
      };
    }

    return [
      {
        id: "invite_1",
        membershipId: "member_2",
        email: "invitee@example.com",
        fullName: "Invited User",
        roleKey: "VIEWER",
        status: "PENDING",
        expiresAt: "2026-05-01T00:00:00.000Z",
        acceptedAt: null,
        revokedAt: null,
        createdAt: "2026-04-12T00:00:00.000Z",
        updatedAt: "2026-04-12T00:00:00.000Z"
      }
    ];
  }),
  getCapabilities: vi.fn(async () => ({
    roleKey: "OWNER",
    permissions: [
      "shell.settings.read",
      "platform.membership.read",
      "platform.membership.manage",
      "connectors.read",
      "connectors.write",
      "connectors.sync"
    ]
  }))
}));

vi.mock("../api", () => ({
  fetchServerJson
}));

vi.mock("./route-utils", () => ({
  getCapabilities,
  hasPermission: (capabilities: { permissions: string[] }, permission: string) =>
    capabilities.permissions.includes(permission),
  settingsNav: (orgSlug: string, activeKey: string) =>
    [
      ["tax-rates", "Tax Rates"],
      ["team-access", "Team & Access"],
      ["connector-settings", "Connector Settings"]
    ].map(([key, label]) => ({
      href: `/${orgSlug}/settings/${key}`,
      label,
      active: key === activeKey
    }))
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn()
  })
}));

import { renderSettingsPage } from "./settings-pages";

describe("settings pages", () => {
  it("renders the Team & Access settings section with live membership data", async () => {
    render(await renderSettingsPage("nomad-events", ["settings", "team-access"]));

    expect(fetchServerJson).toHaveBeenCalledWith("/v1/memberships/team");
    expect(fetchServerJson).toHaveBeenCalledWith("/v1/memberships/invitations");
    expect(
      screen.getByRole("heading", { level: 2, name: "Team & Access" })
    ).toBeTruthy();
    expect(screen.getByText("Daftar Owner")).toBeTruthy();
    expect(screen.getByText("Invited User")).toBeTruthy();
  });

  it("renders a permission-denied state when membership read access is missing", async () => {
    getCapabilities.mockResolvedValueOnce({
      roleKey: "VIEWER",
      permissions: []
    });

    render(await renderSettingsPage("nomad-events", ["settings", "team-access"]));

    expect(
      screen.getByText(
        "Your current role does not allow access to team administration for this organization."
      )
    ).toBeTruthy();
  });

  it("renders connector readiness with live connection controls", async () => {
    render(await renderSettingsPage("nomad-events", ["settings", "connector-settings"]));

    expect(fetchServerJson).toHaveBeenCalledWith("/v1/connectors/accounts");
    expect(fetchServerJson).toHaveBeenCalledWith("/v1/connectors/logs");
    expect(screen.getByText("Connector Readiness")).toBeTruthy();
    expect(screen.getByText("Connect accounting providers")).toBeTruthy();
    expect(screen.getAllByText("Nomad Events Xero").length).toBeGreaterThan(0);
    expect(screen.getByText("Connector Activity Log")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reconnect Xero" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Run import sync" })).toBeTruthy();
  });
});
