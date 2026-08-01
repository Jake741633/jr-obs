import { Children } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface MobileActionDockProps {
  children: ReactNode;
  summary?: ReactNode;
  className?: string;
}

export function MobileActionDock({ children, summary, className = "" }: MobileActionDockProps) {
  const actionCount = Children.count(children);
  const actionColumns = actionCount >= 5 ? "grid-cols-5" : actionCount === 4 ? "grid-cols-4" : actionCount === 2 ? "grid-cols-2" : "grid-cols-3";

  return (
    <div className={`fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 px-3 lg:hidden ${className}`}>
      <div className="mx-auto flex w-full max-w-lg items-center gap-2 rounded-2xl border border-slate-700/80 bg-slate-950/95 p-2 shadow-2xl shadow-black/40 backdrop-blur">
        {summary ? <div className="min-w-0 max-w-28 flex-1 px-2">{summary}</div> : null}
        <div className={`grid min-w-0 flex-[2] gap-1 ${actionColumns}`}>{children}</div>
      </div>
    </div>
  );
}

export function MobileDockAction({ icon, label, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: ReactNode; label: string }) {
  return (
    <button
      type="button"
      className="flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-2 text-[11px] font-semibold text-slate-300 transition active:scale-[0.98] active:bg-slate-800 disabled:opacity-50"
      {...props}
    >
      {icon}
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}
