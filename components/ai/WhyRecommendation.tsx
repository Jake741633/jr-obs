import Link from "next/link";
import { ArrowUpRight, History } from "lucide-react";
import type { AiLearningEvidence } from "../../lib/models";

export function WhyRecommendation({
  evidence,
  title = "Why this recommendation?",
  emptyMessage = "No close successful JR OS record is available yet, so saved defaults and cautious starter allowances were used.",
  showHeading = true,
}: {
  evidence: AiLearningEvidence[];
  title?: string;
  emptyMessage?: string;
  showHeading?: boolean;
}) {
  return (
    <div>
      {showHeading ? (
        <div className="flex items-center gap-3">
          <History className="size-5 text-violet-300" />
          <div>
            <h3 className="font-bold">{title}</h3>
            <p className="text-xs text-slate-500">Only saved JR OS evidence is shown—no invented jobs.</p>
          </div>
        </div>
      ) : null}
      {!evidence.length ? (
        <p className={`${showHeading ? "mt-4" : ""} text-sm text-slate-500`}>{emptyMessage}</p>
      ) : (
        <div className={`${showHeading ? "mt-4" : ""} space-y-2`}>
          {evidence.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="group flex items-start justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 transition hover:border-violet-400/30"
            >
              <span className="min-w-0">
                <span className="block text-xs font-semibold uppercase tracking-wider text-violet-300">{item.kind} · {item.relevance}% match</span>
                <strong className="mt-1 block text-sm text-slate-100">{item.title}</strong>
                <span className="mt-1 block text-xs text-slate-500">{item.detail}</span>
              </span>
              <ArrowUpRight className="mt-1 size-4 shrink-0 text-slate-600 transition group-hover:text-violet-300" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
