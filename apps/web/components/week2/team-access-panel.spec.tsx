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

import { TeamAccessPanel } from "./team-access-panel";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

const baseMembers = [
  {
    id: "member_current",
    userId: "user_current",
    fullName: "Daftar Owner",
    email: "owner@daftar.local",
    roleKey: "OWNER" as const,
    status: "ACTIVE" as const,
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-10T00:00:00.000Z",
    isCurrentUser: true,
    isLastActiveOwner: false
  },
  {
    id: "member_two",
    userId: "user_two",
    fullName: "Read Only Viewer",
    email: "viewer@daftar.local",
    roleKey: "VIEWER" as const,
    status: "ACTIVE" as const,
    createdAt: "2026-04-02T00:00:00.000Z",
    updatedAt: "2026-04-10T00:00:00.000Z",
    isCurrentUser: false,
    isLastActiveOwner: false
  }
];

const baseInvitations = [
  {
    id: "invite_1",
    membershipId: "member_invited",
    email: "invitee@example.com",
    fullName: "Invited User",
    roleKey: "ACCOUNTANT" as const,
    status: "PENDING" as const,
    expiresAt: "2026-05-01T00:00:00.000Z",
    acceptedAt: null,
    revokedAt: null,
    createdAt: "2026-04-12T00:00:00.000Z",
    updatedAt: "2026-04-12T00:00:00.000Z"
  }
];

describe("team access panel", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("renders members and invitations in one customer-facing page", () => {
    render(
      <TeamAccessPanel
        canManage
        canRead
        invitations={baseInvitations}
        members={baseMembers}
        orgSlug="nomad-events"
      />
    );

    expect(screen.getByText("Members")).toBeTruthy();
    expect(screen.getByText("Daftar Owner")).toBeTruthy();
    expect(screen.getByText("Invitations")).toBeTruthy();
    expect(screen.getByText("Invited User")).toBeTruthy();
  });

  it("creates invitations through the team admin endpoint", async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/v1/memberships/invitations")) {
        expect(init?.method ?? "POST").toBe("POST");
        expect(init?.credentials).toBe("include");
        expect(init?.body).toBe(
          JSON.stringify({
            email: "new.user@example.com",
            fullName: "New User",
            roleKey: "VIEWER"
          })
        );
        return jsonResponse(
          {
            id: "invite_new",
            membershipId: "member_new",
            email: "new.user@example.com",
            fullName: "New User",
            roleKey: "VIEWER",
            status: "PENDING"
          },
          201
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(
      <TeamAccessPanel
        canManage
        canRead
        invitations={baseInvitations}
        members={baseMembers}
        orgSlug="nomad-events"
      />
    );

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "new.user@example.com" }
    });
    fireEvent.change(screen.getByLabelText("Full Name"), {
      target: { value: "New User" }
    });
    fireEvent.change(screen.getAllByRole("combobox")[2], {
      target: { value: "VIEWER" }
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Create invitation" }).closest("form")!
    );

    await waitFor(() =>
      expect(screen.getByText("Invitation created and queued for delivery.")).toBeTruthy()
    );
    expect(router.refresh).toHaveBeenCalled();
  });

  it("refreshes the current session after changing the signed-in member role", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);

      if (url.endsWith("/v1/memberships/member_current/role")) {
        return jsonResponse(
          {
            id: "member_current",
            roleKey: "ADMIN"
          },
          200
        );
      }

      if (url.endsWith("/v1/auth/refresh")) {
        return jsonResponse(
          {
            organization: { slug: "nomad-events" },
            capabilitySnapshot: {
              permissions: ["shell.settings.read", "platform.membership.read"]
            }
          },
          201
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(
      <TeamAccessPanel
        canManage
        canRead
        invitations={baseInvitations}
        members={baseMembers}
        orgSlug="nomad-events"
      />
    );

    const roleSelects = screen.getAllByRole("combobox");
    fireEvent.change(roleSelects[0], { target: { value: "ADMIN" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Update role" })[0]);

    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(router.push).not.toHaveBeenCalled();
  });

  it("redirects out of settings when the refreshed capability snapshot loses settings access", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);

      if (url.endsWith("/v1/memberships/member_current/role")) {
        return jsonResponse(
          {
            id: "member_current",
            roleKey: "VIEWER"
          },
          200
        );
      }

      if (url.endsWith("/v1/auth/refresh")) {
        return jsonResponse(
          {
            organization: { slug: "nomad-events" },
            capabilitySnapshot: {
              permissions: ["platform.membership.read"]
            }
          },
          201
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(
      <TeamAccessPanel
        canManage
        canRead
        invitations={baseInvitations}
        members={baseMembers}
        orgSlug="nomad-events"
      />
    );

    const roleSelects = screen.getAllByRole("combobox");
    fireEvent.change(roleSelects[0], { target: { value: "VIEWER" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Update role" })[0]);

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/nomad-events"));
  });
});
