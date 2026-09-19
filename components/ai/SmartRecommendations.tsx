import Link from "next/link";
import { AlertTriangle, ArrowRight, BadgeCheck, CircleAlert, Lightbulb, ShieldAlert } from "lucide-react";
import { Card } from "../ui/Card";
import type { AiRecommendation, AiRecommendationSeverity } from "../../lib/aiCommandCentre";

const severityStyle: Record<AiRecommendationSeverity, { badge: string; icon: typeof ShieldAlert; iconStyle: string }> = {
  Urgent: { badge: "bg-red-500/10 text-red-300", icon: ShieldAlert, iconStyle: "text-red-300" },
  Warning: { badge: "bg-amber-500/10 text-amber-300", icon: AlertTriangle, iconStyle: "text-amber-300" },
  Opportunity: { badge: "bg-blue-500/10 text-blue-300", icon: Lightbulb, iconStyle: "text-blue-300" },
  Good: { badge: "bg-emerald-500/10 text-emerald-300", icon: BadgeCheck, iconStyle: "text-emerald-300" },
};

export function SmartRecommendations({ recommendations }: { recommendations: AiRecommendation[] }) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <CircleAlert className="mt-0.5 size-6 text-amber-300" />
        <div>
          <h2 className="text-xl font-bold">Smart Recommendations</h2>
          <p className="text-sm text-slate-500">Live checks for margin, certification, debt, quote expiry and workflow gaps.</p>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        {recommendations.slice(0, 8).map((recommendation) => {
          const style = severityStyle[recommendation.severity];
          const Icon = style.icon;
          return (
            <Link
              key={recommendation.id}
              href={recommendation.href}
              className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 transition hover:border-slate-700"
            >
              <Icon className={`mt-0.5 size-5 shrink-0 ${style.iconStyle}`} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style.badge}`}>{recommendation.severity}</span>
                  <strong className="text-sm text-slate-100">{recommendation.title}</strong>
                </span>
                <span className="mt-2 block text-sm leading-6 text-slate-400">{recommendation.detail}</span>
                <span className="mt-2 block text-xs font-semibold uppercase tracking-wider text-slate-600">{recommendation.kind}</span>
              </span>
              <ArrowRight className="mt-1 size-4 shrink-0 text-slate-600" />
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
