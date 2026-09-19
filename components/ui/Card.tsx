import type { HTMLAttributes } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`min-w-0 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm sm:p-5 ${className}`} {...props} />;
}
