"use client";

import React from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  InvitationPreviewRecord,
  PasswordResetRequestRecord
} from "@daftar/types";
import { Button, StatusBadge } from "@daftar/ui";

import { AuthFrame } from "../auth-frame";
import { presentEmail, presentOrganizationName } from "../presentation";

function AuthShell({
  eyebrow,
  title,
  description,
  children
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <AuthFrame
      description={description}
      eyebrow={eyebrow}
      title={title}
    >
      {children}
    </AuthFrame>
  );
}

function ErrorMessage({ error }: { error: string | null }) {
  return error ? <p className="text-sm text-rose-600">{error}</p> : null;
}

export function InvitationAcceptPanel({ token }: { token?: string }) {
  const router = useRouter();
  const apiBaseUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    []
  );
  const [preview, setPreview] = useState<InvitationPreviewRecord | null>(null);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [isPending, startTransition] = useTransition();
  const invitationLocked = preview ? preview.status !== "PENDING" : false;

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/v1/auth/invitations/${token}`);
        if (!response.ok) {
          throw new Error("Invitation token is invalid or unavailable.");
        }

        const payload = (await response.json()) as InvitationPreviewRecord;
        if (cancelled) {
          return;
        }

        setPreview(payload);
        setFullName(payload.fullName);
      } catch (caughtError) {
        if (!cancelled) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Unable to load invitation."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, token]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setError("Invitation token is missing.");
      return;
    }

    setError(null);

    startTransition(async () => {
      const response = await fetch(`${apiBaseUrl}/v1/auth/invitations/accept`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          token,
          fullName,
          password
        })
      });

      if (!response.ok) {
        const message = await response.text();
        setError(message || "Unable to accept invitation.");
        return;
      }

      const payload = (await response.json()) as {
        session: { organization: { slug: string } | null };
      };
      router.push(`/${payload.session.organization?.slug ?? ""}`);
      router.refresh();
    });
  }

  return (
    <AuthShell
      eyebrow="Invitation"
      description="Accept the invitation, set your password, and enter the workspace."
      title="Invitation Acceptance"
    >
      {!token ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          This invitation link is missing a token.
        </div>
      ) : loading ? (
        <p className="text-sm text-slate-500">Loading invitation…</p>
      ) : (
        <form className="space-y-4" onSubmit={onSubmit}>
          {preview ? (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {presentOrganizationName(preview.organizationName)}
                  </p>
                  <p className="text-sm text-slate-500">
                    {presentEmail(preview.email) ?? preview.email} •{" "}
                    {preview.roleKey.replaceAll("_", " ")}
                  </p>
                </div>
                <StatusBadge
                  label={preview.status}
                  tone={preview.status === "PENDING" ? "success" : "warning"}
                />
              </div>
            </div>
          ) : null}

          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-700">Full Name</span>
            <input
              className="w-full rounded-2xl border border-slate-300 px-4 py-3"
              disabled={invitationLocked}
              onChange={(event) => setFullName(event.target.value)}
              type="text"
              value={fullName}
            />
          </label>

          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-700">Password</span>
            <input
              className="w-full rounded-2xl border border-slate-300 px-4 py-3"
              disabled={invitationLocked}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </label>

          {invitationLocked ? (
            <p className="text-sm text-slate-500">
              This invitation can no longer be accepted from this link.
            </p>
          ) : null}

          <ErrorMessage error={error} />

          <Button disabled={isPending || !token || invitationLocked} type="submit">
            {isPending ? "Accepting..." : "Accept Invitation"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

export function PasswordResetRequestPanel() {
  const apiBaseUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    []
  );
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PasswordResetRequestRecord | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch(`${apiBaseUrl}/v1/auth/password-reset/request`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ email })
      });

      if (!response.ok) {
        const message = await response.text();
        setError(message || "Unable to request reset.");
        return;
      }

      setResult((await response.json()) as PasswordResetRequestRecord);
    });
  }

  return (
    <AuthShell
      eyebrow="Password Reset"
      description="Request a password reset link for your account. If the address is recognized, reset instructions will be sent through the secure account-recovery flow."
      title="Password Reset Request"
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <label className="block space-y-2 text-sm">
          <span className="font-medium text-slate-700">Email</span>
          <input
            className="w-full rounded-2xl border border-slate-300 px-4 py-3"
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            value={email}
          />
        </label>

        <ErrorMessage error={error} />

        <Button disabled={isPending} type="submit">
          {isPending ? "Submitting..." : "Send reset instructions"}
        </Button>
      </form>

      {result ? (
        <div className="mt-5 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-800">
            Reset request recorded.
          </p>
          <p className="text-sm text-emerald-700">
            If the address exists in Daftar, password reset instructions have been
            sent.
          </p>
        </div>
      ) : null}
    </AuthShell>
  );
}

export function PasswordResetPanel({ token }: { token?: string }) {
  const router = useRouter();
  const apiBaseUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    []
  );
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setError("Reset token is missing.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setError(null);

    startTransition(async () => {
      const response = await fetch(`${apiBaseUrl}/v1/auth/password-reset/confirm`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          token,
          password
        })
      });

      if (!response.ok) {
        const message = await response.text();
        setError(message || "Unable to reset password.");
        return;
      }

      setSuccess("Password updated. Redirecting to sign in...");
      setTimeout(() => {
        router.push("/sign-in");
      }, 500);
    });
  }

  return (
    <AuthShell
      eyebrow="Password Reset"
      description="Complete the password reset with a new password."
      title="Reset Password"
    >
      {!token ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          This reset link is missing a token.
        </div>
      ) : (
        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-700">New Password</span>
            <input
              className="w-full rounded-2xl border border-slate-300 px-4 py-3"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </label>

          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-700">Confirm Password</span>
            <input
              className="w-full rounded-2xl border border-slate-300 px-4 py-3"
              onChange={(event) => setConfirmPassword(event.target.value)}
              type="password"
              value={confirmPassword}
            />
          </label>

          <ErrorMessage error={error} />
          {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

          <Button disabled={isPending || !token} type="submit">
            {isPending ? "Updating..." : "Update Password"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
