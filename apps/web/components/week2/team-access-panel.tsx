"use client";

import React, { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { RoleKey, TeamInvitationRecord, TeamMemberRecord } from "@daftar/types";
import { Button, Card, CardContent, CardHeader, StatusBadge } from "@daftar/ui";

const roleOptions: Array<{ value: RoleKey; label: string }> = [
  { value: "OWNER", label: "Owner" },
  { value: "ADMIN", label: "Admin" },
  { value: "ACCOUNTANT", label: "Accountant" },
  { value: "COMPLIANCE_OFFICER", label: "Compliance Officer" },
  { value: "VIEWER", label: "Viewer" }
];

export function TeamAccessPanel({
  orgSlug,
  members,
  invitations,
  canRead,
  canManage
}: {
  orgSlug: string;
  members: TeamMemberRecord[];
  invitations: TeamInvitationRecord[];
  canRead: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteRoleKey, setInviteRoleKey] = useState<RoleKey>("ACCOUNTANT");
  const [roleDrafts, setRoleDrafts] = useState<Record<string, RoleKey>>(
    () =>
      Object.fromEntries(
        members.map((member) => [member.id, member.roleKey])
      ) as Record<string, RoleKey>
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const apiBaseUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    []
  );
  const inputClass =
    "w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900";

  if (!canRead) {
    return (
      <Card className="border-slate-100">
        <CardContent className="space-y-3 px-6 py-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
            Settings
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
            Team & Access
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-slate-500">
            Your current role does not allow access to team administration for this
            organization.
          </p>
        </CardContent>
      </Card>
    );
  }

  function runMutation(options: {
    actionKey: string;
    endpoint: string;
    method?: "POST" | "PATCH";
    body?: Record<string, unknown>;
    successMessage: string;
    affectsCurrentMembership?: boolean;
  }) {
    setError(null);
    setSuccess(null);
    setPendingAction(options.actionKey);

    startTransition(async () => {
      const response = await fetch(`${apiBaseUrl}${options.endpoint}`, {
        method: options.method ?? "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json"
        },
        body: options.body ? JSON.stringify(options.body) : undefined
      });

      if (!response.ok) {
        setPendingAction(null);
        const message = await response.text();
        setError(message || "Request failed.");
        return;
      }

      if (options.affectsCurrentMembership) {
        const refreshResponse = await fetch(`${apiBaseUrl}/v1/auth/refresh`, {
          method: "POST",
          credentials: "include"
        });

        if (!refreshResponse.ok) {
          setPendingAction(null);
          router.push("/sign-in");
          return;
        }

        const payload = (await refreshResponse.json()) as {
          organization: { slug: string } | null;
          capabilitySnapshot: { permissions: string[] };
        };
        const nextOrgSlug = payload.organization?.slug;
        const hasSettingsAccess =
          payload.capabilitySnapshot.permissions.includes("shell.settings.read") &&
          payload.capabilitySnapshot.permissions.includes(
            "platform.membership.read"
          );

        setPendingAction(null);
        setSuccess(options.successMessage);

        if (!nextOrgSlug) {
          router.push("/sign-in");
          return;
        }

        if (nextOrgSlug !== orgSlug || !hasSettingsAccess) {
          router.push(`/${nextOrgSlug}`);
          return;
        }

        router.refresh();
        return;
      }

      setPendingAction(null);
      setSuccess(options.successMessage);
      router.refresh();
    });
  }

  function submitInvitation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runMutation({
      actionKey: "invite:create",
      endpoint: "/v1/memberships/invitations",
      body: {
        email: inviteEmail,
        fullName: inviteFullName || null,
        roleKey: inviteRoleKey
      },
      successMessage: "Invitation created and queued for delivery."
    });
  }

  return (
    <div className="space-y-6">
      <Card className="border-slate-100">
        <CardHeader>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
              Settings
            </p>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
              Team & Access
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-slate-500">
              Manage organization memberships, control role assignments, and keep
              invitation activity visible in one place.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-slate-100">
          <CardHeader>
            <div className="space-y-1">
              <h3 className="text-2xl font-semibold tracking-tight text-slate-950">
                Members
              </h3>
              <p className="text-sm leading-6 text-slate-500">
                Review active, invited, and disabled memberships for this
                organization.
              </p>
            </div>
          </CardHeader>
          <CardContent>
            {members.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-sm text-slate-500">
                No memberships have been created for this organization yet.
              </div>
            ) : (
              <div className="overflow-hidden rounded-[24px] border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left text-slate-500">
                        <th className="px-4 py-3 font-medium">Member</th>
                        <th className="px-4 py-3 font-medium">Role</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Updated</th>
                        <th className="px-4 py-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {members.map((member) => {
                        const roleChanged =
                          (roleDrafts[member.id] ?? member.roleKey) !== member.roleKey;
                        const disableBlocked =
                          member.status !== "ACTIVE" || member.isLastActiveOwner;
                        const roleBlocked =
                          !canManage ||
                          member.isLastActiveOwner ||
                          (pendingAction !== null && pendingAction !== `member:${member.id}:role`);
                        const isCurrentAction =
                          pendingAction === `member:${member.id}:role` ||
                          pendingAction === `member:${member.id}:disable` ||
                          pendingAction === `member:${member.id}:restore`;

                        return (
                          <tr key={member.id}>
                            <td className="space-y-1 px-4 py-3 align-top">
                              <p className="font-medium text-slate-900">
                                {member.fullName}
                              </p>
                              <p className="text-slate-500">{member.email}</p>
                              {member.isCurrentUser ? (
                                <p className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-700">
                                  Current Session
                                </p>
                              ) : null}
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="space-y-2">
                                <select
                                  className="min-w-40 rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                                  disabled={roleBlocked || isPending}
                                  onChange={(event) =>
                                    setRoleDrafts((current) => ({
                                      ...current,
                                      [member.id]: event.target.value as RoleKey
                                    }))
                                  }
                                  value={roleDrafts[member.id] ?? member.roleKey}
                                >
                                  {roleOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                                {canManage ? (
                                  <Button
                                    disabled={!roleChanged || roleBlocked || isPending}
                                    onClick={() =>
                                      runMutation({
                                        actionKey: `member:${member.id}:role`,
                                        endpoint: `/v1/memberships/${member.id}/role`,
                                        method: "PATCH",
                                        body: {
                                          roleKey: roleDrafts[member.id] ?? member.roleKey
                                        },
                                        successMessage: "Member role updated.",
                                        affectsCurrentMembership: member.isCurrentUser
                                      })
                                    }
                                    type="button"
                                  >
                                    {pendingAction === `member:${member.id}:role` && isPending
                                      ? "Updating..."
                                      : "Update role"}
                                  </Button>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="flex flex-wrap gap-2">
                                <StatusBadge
                                  label={member.status}
                                  tone={
                                    member.status === "ACTIVE"
                                      ? "success"
                                      : member.status === "INVITED"
                                        ? "neutral"
                                        : "warning"
                                  }
                                />
                                {member.isLastActiveOwner ? (
                                  <StatusBadge label="Last Owner" tone="warning" />
                                ) : null}
                              </div>
                            </td>
                            <td className="px-4 py-3 align-top text-slate-500">
                              {new Date(member.updatedAt).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="flex flex-wrap gap-3">
                                {member.status === "ACTIVE" ? (
                                  <Button
                                    disabled={!canManage || disableBlocked || isCurrentAction}
                                    onClick={() =>
                                      runMutation({
                                        actionKey: `member:${member.id}:disable`,
                                        endpoint: `/v1/memberships/${member.id}/disable`,
                                        successMessage: "Membership disabled.",
                                        affectsCurrentMembership: member.isCurrentUser
                                      })
                                    }
                                    type="button"
                                  >
                                    {pendingAction === `member:${member.id}:disable` &&
                                    isPending
                                      ? "Disabling..."
                                      : "Disable"}
                                  </Button>
                                ) : null}
                                {member.status === "DISABLED" ? (
                                  <Button
                                    disabled={!canManage || isCurrentAction}
                                    onClick={() =>
                                      runMutation({
                                        actionKey: `member:${member.id}:restore`,
                                        endpoint: `/v1/memberships/${member.id}/restore`,
                                        successMessage: "Membership restored.",
                                        affectsCurrentMembership: member.isCurrentUser
                                      })
                                    }
                                    type="button"
                                  >
                                    {pendingAction === `member:${member.id}:restore` &&
                                    isPending
                                      ? "Restoring..."
                                      : "Restore"}
                                  </Button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-100">
          <CardHeader>
            <div className="space-y-1">
              <h3 className="text-2xl font-semibold tracking-tight text-slate-950">
                Invite Member
              </h3>
              <p className="text-sm leading-6 text-slate-500">
                Create a tenant-scoped invitation with a specific organization role.
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submitInvitation}>
              <label className="block space-y-2 text-sm">
                <span className="font-medium text-slate-700">Email</span>
                <input
                  className={inputClass}
                  disabled={!canManage || isPending}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="name@company.com"
                  type="email"
                  value={inviteEmail}
                />
              </label>

              <label className="block space-y-2 text-sm">
                <span className="font-medium text-slate-700">Full Name</span>
                <input
                  className={inputClass}
                  disabled={!canManage || isPending}
                  onChange={(event) => setInviteFullName(event.target.value)}
                  placeholder="Member full name"
                  type="text"
                  value={inviteFullName}
                />
              </label>

              <label className="block space-y-2 text-sm">
                <span className="font-medium text-slate-700">Role</span>
                <select
                  className={inputClass}
                  disabled={!canManage || isPending}
                  onChange={(event) =>
                    setInviteRoleKey(event.target.value as RoleKey)
                  }
                  value={inviteRoleKey}
                >
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <Button
                disabled={!canManage || isPending}
                type="submit"
              >
                {pendingAction === "invite:create" && isPending
                  ? "Creating..."
                  : "Create invitation"}
              </Button>

              {!canManage ? (
                <p className="text-sm text-slate-500">
                  Your current role has read-only access.
                </p>
              ) : null}
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-100">
        <CardHeader>
          <div className="space-y-1">
            <h3 className="text-2xl font-semibold tracking-tight text-slate-950">
              Invitations
            </h3>
            <p className="text-sm leading-6 text-slate-500">
              Review invitation history, resend pending invites, and revoke links that
              should no longer be used.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {invitations.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-sm text-slate-500">
              No invitations have been issued for this organization.
            </div>
          ) : (
            <div className="overflow-hidden rounded-[24px] border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-slate-500">
                      <th className="px-4 py-3 font-medium">Invitee</th>
                      <th className="px-4 py-3 font-medium">Role</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Expires</th>
                      <th className="px-4 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invitations.map((invitation) => (
                      <tr key={invitation.id}>
                        <td className="space-y-1 px-4 py-3 align-top">
                          <p className="font-medium text-slate-900">
                            {invitation.fullName ?? invitation.email}
                          </p>
                          <p className="text-slate-500">{invitation.email}</p>
                        </td>
                        <td className="px-4 py-3 align-top">
                          {invitation.roleKey.replaceAll("_", " ")}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <StatusBadge
                            label={invitation.status}
                            tone={
                              invitation.status === "PENDING"
                                ? "success"
                                : invitation.status === "ACCEPTED"
                                  ? "neutral"
                                  : "warning"
                            }
                          />
                        </td>
                        <td className="px-4 py-3 align-top text-slate-500">
                          {new Date(invitation.expiresAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-wrap gap-3">
                            <Button
                              disabled={!canManage || isPending}
                              onClick={() =>
                                runMutation({
                                  actionKey: `invitation:${invitation.id}:resend`,
                                  endpoint: `/v1/memberships/invitations/${invitation.id}/resend`,
                                  successMessage: "Invitation resent."
                                })
                              }
                              type="button"
                            >
                              {pendingAction === `invitation:${invitation.id}:resend` &&
                              isPending
                                ? "Resending..."
                                : "Resend"}
                            </Button>
                            <Button
                              disabled={
                                !canManage ||
                                isPending ||
                                invitation.status === "ACCEPTED" ||
                                invitation.status === "REVOKED"
                              }
                              onClick={() =>
                                runMutation({
                                  actionKey: `invitation:${invitation.id}:revoke`,
                                  endpoint: `/v1/memberships/invitations/${invitation.id}/revoke`,
                                  successMessage: "Invitation revoked."
                                })
                              }
                              type="button"
                            >
                              {pendingAction === `invitation:${invitation.id}:revoke` &&
                              isPending
                                ? "Revoking..."
                                : "Revoke"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
