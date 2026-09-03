"use client";

import Link from "next/link";
import { ArrowUpRight, History } from "lucide-react";
import { canAccessPath, canUseLocalWorkspaceWithoutIdentity, internalPathForAccess } from "../../lib/cloud/permissions";
import { useCloudIdentity } from "../../lib/cloud/useCloudIdentity";
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
  const { identity, mode } = useCloudIdentity();
  const unrestricted = mode === "local" || (mode === "migration" && !identity);

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
          {evidence.map((item) => {
            const evidencePath = internalPathForAccess(item.href);
            const canOpenEvidence = evidencePath !== null
              && (
                (unrestricted && canUseLocalWorkspaceWithoutIdentity(mode, evidencePath))
                || canAccessPath(identity?.role, evidencePath, identity?.email)
              );
            const content = (
              <>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-violet-300">{item.kind} · {item.relevance}% match</span>
                  <strong className="mt-1 block text-sm text-slate-100">{item.title}</strong>
                  <span className="mt-1 block text-xs text-slate-500">{item.detail}</span>
                </span>
                {canOpenEvidence ? <ArrowUpRight className="mt-1 size-4 shrink-0 text-slate-600 transition group-hover:text-violet-300" /> : null}
              </>
            );

            return canOpenEvidence ? (
              <Link
                key={item.id}
                href={item.href}
                className="group flex items-start justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 transition hover:border-violet-400/30"
              >
                {content}
              </Link>
            ) : (
              <div key={item.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                {content}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
