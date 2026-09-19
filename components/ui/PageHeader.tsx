import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 border-b border-slate-800 pb-5 sm:gap-5 sm:pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-400 sm:text-sm sm:tracking-[0.18em]">{eyebrow}</p> : null}
        <h1 className="break-words text-2xl font-bold leading-tight tracking-tight text-white sm:text-4xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{description}</p> : null}
      </div>
      {action ? <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">{action}</div> : null}
    </header>
  );
}
