import { Card, CardContent } from "@daftar/ui";

export function ModuleLandingPage({
  orgSlug,
  title,
  description
}: {
  orgSlug: string;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-6">
      <Card className="border-slate-200 bg-gradient-to-b from-white via-white to-slate-50 shadow-sm">
        <CardContent className="space-y-6 px-6 py-10 sm:px-10">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-600">
              Workspace Module
            </p>
            <h2 className="text-4xl font-semibold tracking-tight text-slate-950">
              {title}
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-slate-500">
              {description}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <a
              className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
              href={`/${orgSlug}`}
            >
              Back to Home
            </a>
            <a
              className="inline-flex items-center rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-200"
              href={`/${orgSlug}/settings`}
            >
              Open Settings
            </a>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <InfoCard
          description="This area has its own entry surface inside the workspace launcher and navigation, so users land on a dedicated module page instead of a generic fallback."
          title="Dedicated Entry"
        />
        <InfoCard
          description="Authentication, tenant context, navigation, and permissions are already active here, so teams can move directly into the relevant workflow."
          title="Workspace Ready"
        />
        <InfoCard
          description="Additional route-level workflows should follow the approved product scope so the module stays consistent and easy to use."
          title="Scope Guided"
        />
      </div>
    </div>
  );
}

function InfoCard({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="space-y-3 px-5 py-5">
        <h3 className="text-xl font-semibold text-slate-900">{title}</h3>
        <p className="text-sm leading-6 text-slate-500">{description}</p>
      </CardContent>
    </Card>
  );
}
