import { Gauge } from "lucide-react";
import type { AiConfidenceBreakdown } from "../../lib/models";

const labels = [
  ["Labour", "labour"],
  ["Materials", "materials"],
  ["Pricing", "pricing"],
] as const;

function scoreTone(score: number) {
  if (score >= 75) return "text-emerald-300";
  if (score >= 45) return "text-amber-300";
  return "text-slate-400";
}

function barTone(score: number) {
  if (score >= 75) return "bg-emerald-400";
  if (score >= 45) return "bg-amber-400";
  return "bg-slate-500";
}

export function AiConfidenceScore({
  confidence,
  compact = false,
}: {
  confidence: AiConfidenceBreakdown;
  compact?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Gauge className="size-5 text-cyan-300" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">AI confidence</p>
            <p className="text-xs text-slate-500">Based on complete, accepted and paid JR OS history.</p>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-black ${scoreTone(confidence.overall)}`}>{confidence.overall}%</p>
          <p className="text-xs font-semibold text-slate-500">{confidence.level}</p>
        </div>
      </div>
      <div className={`mt-4 grid gap-3 ${compact ? "sm:grid-cols-3" : "md:grid-cols-3"}`}>
        {labels.map(([label, key]) => {
          const score = confidence[key];
          return (
            <div key={key}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">{label}</span>
                <strong className={scoreTone(score)}>{score}%</strong>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div className={`h-full rounded-full ${barTone(score)}`} style={{ width: `${score}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {!compact && confidence.reasons.length ? (
        <div className="mt-4 space-y-1">
          {confidence.reasons.map((reason) => <p key={reason} className="text-xs text-slate-500">{reason}</p>)}
        </div>
      ) : null}
    </div>
  );
}
