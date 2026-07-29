import type { HTMLAttributes } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm ${className}`} {...props} />;
}
