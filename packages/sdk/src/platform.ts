import type {
  CapabilitySnapshot,
  CreateInvitationInput,
  MembershipSummary,
  OrganizationSummary,
  SessionSnapshot,
  TeamInvitationRecord,
  TeamMemberRecord,
  UpdateMembershipRoleInput
} from "@daftar/types";

export type PlatformClientOptions = {
  baseUrl: string;
  headers?: HeadersInit;
  credentials?: RequestCredentials;
};

export class PlatformClient {
  constructor(private readonly options: PlatformClientOptions) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.options.baseUrl}${path}`, {
      credentials: this.options.credentials ?? "include",
      ...init,
      headers: {
        "content-type": "application/json",
        ...(this.options.headers ?? {}),
        ...(init?.headers ?? {})
      }
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    return (await response.json()) as T;
  }

  session() {
    return this.request<SessionSnapshot>("/v1/auth/session");
  }

  me() {
    return this.request<SessionSnapshot["user"]>("/v1/me");
  }

  organizations() {
    return this.request<OrganizationSummary[]>("/v1/organizations");
  }

  currentOrganization() {
    return this.request<OrganizationSummary | null>("/v1/organizations/current");
  }

  memberships() {
    return this.request<MembershipSummary[]>("/v1/memberships");
  }

  teamMembers() {
    return this.request<TeamMemberRecord[]>("/v1/memberships/team");
  }

  invitations() {
    return this.request<TeamInvitationRecord[]>("/v1/memberships/invitations");
  }

  createInvitation(input: CreateInvitationInput) {
    return this.request<TeamInvitationRecord>("/v1/memberships/invitations", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  resendInvitation(invitationId: string) {
    return this.request<TeamInvitationRecord>(
      `/v1/memberships/invitations/${invitationId}/resend`,
      {
        method: "POST"
      }
    );
  }

  revokeInvitation(invitationId: string) {
    return this.request<TeamInvitationRecord>(
      `/v1/memberships/invitations/${invitationId}/revoke`,
      {
        method: "POST"
      }
    );
  }

  updateMembershipRole(membershipId: string, input: UpdateMembershipRoleInput) {
    return this.request<TeamMemberRecord>(`/v1/memberships/${membershipId}/role`, {
      method: "PATCH",
      body: JSON.stringify(input)
    });
  }

  disableMembership(membershipId: string) {
    return this.request<TeamMemberRecord>(`/v1/memberships/${membershipId}/disable`, {
      method: "POST"
    });
  }

  restoreMembership(membershipId: string) {
    return this.request<TeamMemberRecord>(`/v1/memberships/${membershipId}/restore`, {
      method: "POST"
    });
  }

  capabilities() {
    return this.request<CapabilitySnapshot>("/v1/rbac/capabilities");
  }

  switchOrganization(orgSlug: string) {
    return this.request<OrganizationSummary>("/v1/organizations/switch", {
      method: "POST",
      body: JSON.stringify({ orgSlug })
    });
  }
}
