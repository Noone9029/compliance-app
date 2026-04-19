import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { fetchServerJson } = vi.hoisted(() => ({
  fetchServerJson: vi.fn(async () => ({
    metrics: {
      totalEvents: 3,
      successCount: 2,
      failureCount: 1,
      userEvents: 2,
      systemEvents: 1
    },
    events: [
      {
        id: "audit_1",
        organizationId: "org_1",
        actorType: "USER",
        actorUserId: "user_1",
        actorDisplayName: "Daftar Admin",
        actorEmail: "admin@example.com",
        action: "platform.auth.sign_in",
        targetType: "session",
        targetId: "session_1",
        result: "SUCCESS",
        requestId: "req_1",
        ipAddress: "127.0.0.1",
        userAgent: "Vitest",
        metadata: { source: "spec" },
        createdAt: "2026-04-16T18:00:00.000Z"
      }
    ]
  }))
}));

vi.mock("../api", () => ({
  fetchServerJson
}));

import { renderAuditReportPage } from "./audit-report-page";

describe("audit report page", () => {
  it("renders audit metrics, filters, and event rows", async () => {
    render(
      await renderAuditReportPage("nomad-events", {
        search: "auth",
        result: "SUCCESS"
      })
    );

    expect(fetchServerJson).toHaveBeenCalledWith(
      "/v1/audit-report?search=auth&result=SUCCESS"
    );
    expect(screen.getByText("Audit Report")).toBeTruthy();
    expect(screen.getByDisplayValue("auth")).toBeTruthy();
    expect(screen.getByDisplayValue("SUCCESS")).toBeTruthy();
    expect(screen.getByText("platform.auth.sign_in")).toBeTruthy();
    expect(screen.getByText("Daftar Admin")).toBeTruthy();
    expect(screen.getAllByText("3").length).toBeGreaterThanOrEqual(2);
  });
});
