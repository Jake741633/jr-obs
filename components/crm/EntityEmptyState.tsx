import type { ReactNode } from "react";

export function EntityEmptyState({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-8 text-center"><div><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-800 text-cyan-300">{icon}</div><h2 className="mt-4 text-lg font-bold">{title}</h2><p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p></div></div>;
}
