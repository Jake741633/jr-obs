import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card } from "../ui/Card";

export interface HandoverReadinessSummary {
  ready: boolean;
  status: "Ready for handover" | "Handover blocked";
  blockers: string[];
  blockerCount: number;
}

interface HandoverReadinessCardProps {
  readiness: HandoverReadinessSummary;
}

export function HandoverReadinessCard({ readiness }: HandoverReadinessCardProps) {
  const Icon = readiness.ready ? CheckCircle2 : AlertTriangle;

  return (
    <Card aria-live="polite" className="space-y-4">
      <div className="flex min-w-0 items-start gap-3">
        <Icon
          aria-hidden="true"
          className={`mt-0.5 size-5 shrink-0 ${readiness.ready ? "text-emerald-300" : "text-amber-300"}`}
        />
        <div className="min-w-0">
          <h2 className="font-semibold text-white">Job handover readiness</h2>
          <p className={`mt-1 text-sm ${readiness.ready ? "text-emerald-200" : "text-amber-200"}`}>
            {readiness.status}
          </p>
        </div>
      </div>

      {readiness.ready ? (
        <p className="text-sm text-slate-300">
          Testing, certificates, materials, tasks, snags, QA and required handover documents are complete.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-slate-300">
            {readiness.blockerCount} {readiness.blockerCount === 1 ? "item is" : "items are"} blocking handover.
          </p>
          <ul className="space-y-2 text-sm text-slate-300">
            {readiness.blockers.map((blocker) => (
              <li key={blocker} className="flex min-w-0 items-start gap-2">
                <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-amber-300" />
                <span className="min-w-0 break-words">{blocker}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
