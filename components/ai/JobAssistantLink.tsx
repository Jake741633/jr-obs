"use client";

import Link from "next/link";
import { assistantJobBriefingHref } from "../../lib/assistantJobLink";
import { canAccessPath } from "../../lib/cloud/permissions";
import { useCloudIdentity } from "../../lib/cloud/useCloudIdentity";

export function JobAssistantLink({ jobId }: { jobId: string }) {
  const { identity, isReady, mode } = useCloudIdentity();
  const href = assistantJobBriefingHref(jobId);
  const local = mode === "local" || (mode === "migration" && !identity);
  if (!isReady || !href || (!local && !canAccessPath(identity?.role, "/ai/assistant", identity?.email))) return null;
  return <Link href={href} className="mt-4 flex min-h-12 items-center justify-center rounded-xl border border-cyan-400/30 px-4 py-3 text-sm font-semibold text-cyan-200 sm:inline-flex">Ask JR AI about this job</Link>;
}
