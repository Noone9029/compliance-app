import type { HTMLAttributes, PropsWithChildren } from "react";

import { cn } from "../lib/utils";

export function Card({
  children,
  className,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return (
    <div
      className={cn(
        "rounded-[28px] border border-slate-200/90 bg-white shadow-[0_24px_48px_-34px_rgba(15,23,42,0.24)]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return (
    <div
      className={cn("border-b border-slate-100 px-6 py-5 sm:px-7", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardContent({
  children,
  className,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return (
    <div className={cn("px-6 py-5 sm:px-7", className)} {...props}>
      {children}
    </div>
  );
}
