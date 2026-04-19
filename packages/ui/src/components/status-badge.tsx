import { cn } from "../lib/utils";

export function StatusBadge({
  label,
  tone = "neutral"
}: {
  label: string;
  tone?: "neutral" | "success" | "warning";
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
        tone === "neutral" && "border-slate-200 bg-slate-100 text-slate-700",
        tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-700",
        tone === "warning" && "border-amber-200 bg-amber-50 text-amber-700"
      )}
    >
      {label}
    </span>
  );
}
