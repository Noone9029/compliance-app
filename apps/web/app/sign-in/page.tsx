"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button, StatusBadge } from "@daftar/ui";

import { AuthFrame } from "../../components/auth-frame";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/v1/auth/sign-in`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({ email, password })
        }
      );

      if (!response.ok) {
        throw new Error("Invalid credentials.");
      }

      const data = (await response.json()) as { organization: { slug: string } | null };
      router.push(`/${data.organization?.slug ?? ""}`);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthFrame
      asidePoints={[
        "Secure access to your accounting and compliance workspace.",
        "Tenant-aware routing keeps each organization in its own environment.",
        "Sign in with your organization credentials to continue."
      ]}
      description="Enter your credentials to continue into your workspace."
      eyebrow="Authentication"
      title="Sign in to Daftar"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <StatusBadge label="Secure Access" tone="success" />
          <p className="text-sm text-emerald-800">
            Use the same credentials assigned to your organization workspace.
          </p>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-700">Email</span>
            <input
              className="w-full rounded-2xl border border-slate-300 px-4 py-3"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
              type="email"
              value={email}
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-700">Password</span>
            <input
              className="w-full rounded-2xl border border-slate-300 px-4 py-3"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              type="password"
              value={password}
            />
          </label>
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <a className="text-sm font-medium text-slate-500 transition hover:text-slate-900" href="/password/reset-request">
              Forgot password?
            </a>
            <Button disabled={submitting} type="submit">
              {submitting ? "Signing in..." : "Sign in"}
            </Button>
          </div>
        </form>
      </div>
    </AuthFrame>
  );
}
