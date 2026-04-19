import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

import { cn } from "../lib/utils";

export function Button({
  children,
  className,
  type = "button",
  ...props
}: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_18px_30px_-18px_rgba(95,159,77,0.75)] transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
