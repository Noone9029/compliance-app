import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = {
  push: vi.fn(),
  refresh: vi.fn()
};

vi.mock("next/navigation", () => ({
  useRouter: () => router
}));

import {
  InvitationAcceptPanel,
  PasswordResetRequestPanel
} from "./auth-flows";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

describe("auth flows", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("keeps password reset requests neutral and never renders a raw reset link", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }, 201));

    render(<PasswordResetRequestPanel />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "admin@daftar.local" }
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Send reset instructions" }).closest("form")!
    );

    await waitFor(() =>
      expect(screen.getByText("Reset request recorded.")).toBeTruthy()
    );
    expect(
      screen.getByText(
        "If the address exists in Daftar, password reset instructions have been sent."
      )
    ).toBeTruthy();
    expect(screen.queryByText(/token=/i)).toBeNull();
    expect(screen.queryByText(/password\/reset\?token=/i)).toBeNull();
  });

  it("locks invitation acceptance when the invitation is no longer pending", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          email: "invitee@example.com",
          fullName: "Invited User",
          organizationName: "Nomad Events Arabia Limited",
          organizationSlug: "nomad-events",
          roleKey: "VIEWER",
          expiresAt: "2026-05-01T00:00:00.000Z",
          status: "REVOKED"
        },
        200
      )
    );

    render(<InvitationAcceptPanel token="revoked-token" />);

    await waitFor(() =>
      expect(screen.getByText("This invitation can no longer be accepted from this link.")).toBeTruthy()
    );
    expect(
      screen.getByRole("button", { name: "Accept Invitation" }).getAttribute("disabled")
    ).not.toBeNull();
  });
});
