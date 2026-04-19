import React from "react";
import type { ReactNode } from "react";

type AuthFrameProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  asideTitle?: string;
  asideDescription?: string;
  asidePoints?: string[];
};

const defaultPoints = [
  "Tenant-aware sign in and workspace switching.",
  "Accounting, reporting, contacts, billing, and compliance in one workspace.",
  "A streamlined finance experience designed for day-to-day operations."
];

export function AuthFrame({
  eyebrow,
  title,
  description,
  children,
  asideTitle = "Daftar",
  asideDescription = "A streamlined finance workspace for accounting, compliance, reporting, and operational control.",
  asidePoints = defaultPoints
}: AuthFrameProps) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#ffffff_0%,#f3f5fb_42%,#edf1f7_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl overflow-hidden rounded-[34px] border border-white/70 bg-white/72 shadow-[0_30px_90px_-48px_rgba(15,23,42,0.45)] backdrop-blur-xl lg:grid-cols-[0.95fr_1.05fr]">
        <section className="relative hidden overflow-hidden bg-slate-950 px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(115,183,95,0.28),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.18),transparent_38%)]" />
          <div className="relative space-y-8">
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-300">
                {asideTitle}
              </p>
              <h1 className="max-w-sm text-5xl font-semibold leading-tight tracking-tight">
                Finance operations without the clutter.
              </h1>
              <p className="max-w-md text-base leading-7 text-slate-300">
                {asideDescription}
              </p>
            </div>

            <div className="space-y-4">
              {asidePoints.map((point) => (
                <div
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4"
                  key={point}
                >
                  <p className="text-sm leading-6 text-slate-200">{point}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative rounded-3xl border border-white/10 bg-white/5 px-5 py-5">
            <p className="text-sm font-medium text-white">Platform Notes</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Organized for practical finance work with clean navigation, clear actions, and room for operational scale.
            </p>
          </div>
        </section>

        <section className="flex items-center px-5 py-8 sm:px-8 lg:px-12">
          <div className="mx-auto w-full max-w-xl space-y-6">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
                {eyebrow}
              </p>
              <h2 className="text-4xl font-semibold tracking-tight text-slate-950">
                {title}
              </h2>
              <p className="max-w-lg text-sm leading-6 text-slate-500">
                {description}
              </p>
            </div>

            <div className="rounded-[30px] border border-slate-200/90 bg-white px-6 py-6 shadow-[0_24px_48px_-34px_rgba(15,23,42,0.24)] sm:px-8 sm:py-8">
              {children}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
