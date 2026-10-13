import type { CloudMode } from "./cloud/config";

// Retain the registered collection and its account/tenant storage boundaries.
export const RELEASE_REVIEW_STORAGE_KEY = "jr-os-release-readiness-v0-1";
export const RELEASE_REQUIREMENTS_VERSION = 2;

export interface ReleaseRequirement {
  id: string;
  title: string;
  detail: string;
}

export interface ReleaseEvidence {
  id: string;
  complete: boolean;
  requirement: string;
  reviewedAt?: string;
}

export const releaseModeGuidance: Record<CloudMode, { title: string; detail: string }> = {
  local: {
    title: "Local mode",
    detail: "Business records stay in this browser. They do not automatically appear on another device or in an installed app. Review browser backups and local workflows. A later cloud rollout needs its own cloud, backup and migration checks.",
  },
  migration: {
    title: "Migration mode",
    detail: "JR OS is preparing the move from browser records to Supabase. Sign-in and import tools are available, but this setting does not prove that every record or queued change has reached the cloud. Review reconciliation before switching modes.",
  },
  cloud: {
    title: "Cloud mode",
    detail: "Signed-in work uses Supabase with account-scoped browser caches and pending changes. Confirm live access and successful syncing on each device. Selecting cloud mode does not prove that deployment, recovery or mobile acceptance checks have passed.",
  },
};

export function releaseRequirements(mode: CloudMode): ReleaseRequirement[] {
  const phoneDetail = mode === "local"
    ? "Install from the normal HTTPS address and relaunch from the home-screen icon. Check navigation, forms, safe areas and the signed-out local workspace. Verify storage separation from the browser; installation does not copy local records or guarantee an offline cold launch."
    : "Install from the normal HTTPS address and relaunch from the home-screen icon. Check signed-out, office, field and customer accounts, role destinations, forms and safe areas. Verify browser/app storage separation and offline/online recovery. Desktop emulation is not physical-device acceptance.";
  const checks: ReleaseRequirement[] = [
    { id: "ci", title: "Exact release commit has passed its checks", detail: "Review tests, lint, TypeScript, production build, dependency audits, JR OS CI, JR OS Phase 1 CI and the deployed preview for the exact commit being released. A previous green commit does not verify a newer one." },
    { id: "desktop", title: "Desktop navigation reviewed", detail: "Open the relevant workspace links and confirm there are no blank pages, runtime errors or inaccessible controls on the release candidate." },
    { id: "iphone", title: "Physical iPhone installation and relaunch reviewed", detail: phoneDetail },
    { id: "android", title: "Physical Android installation and relaunch reviewed", detail: phoneDetail },
    { id: "customer", title: "Customer workflow reviewed", detail: "Create, edit and reopen a synthetic customer in the intended test environment. Check that refresh preserves the intended changes and verify the permitted delete/archive behaviour." },
    { id: "job", title: "Job workflow reviewed", detail: "Create a synthetic job, link its customer, update its status and confirm persistence after refresh in the intended test environment." },
    { id: "quote", title: "Quote workflow reviewed", detail: "Create and reopen a synthetic quote with labour and materials. Verify totals, customer-facing output and the Quote Review workflow without exposing internal pricing." },
    { id: "invoice", title: "Invoice and payment workflow reviewed", detail: "Create a synthetic invoice, record a test part payment and confirm the outstanding balance without initiating a real payment." },
    { id: "technical", title: "Technical records reviewed", detail: "Create synthetic survey, RAMS and draft certificate records linked to a test job. Check permissions, persistence and document output without issuing a real certificate." },
    { id: "browser-backup", title: "Browser backup and recovery reviewed", detail: "Export and inspect the intended browser/account JSON backup and test recovery in an isolated workspace. A browser export is not a production database backup and does not establish recovery of Auth identities or Storage object bytes." },
    { id: "mode", title: `${releaseModeGuidance[mode].title} limitations reviewed`, detail: releaseModeGuidance[mode].detail },
  ];
  if (mode !== "local") checks.push(
    { id: "sync", title: "Account access and queue reconciliation reviewed", detail: "Verify sign-in, token refresh and same-account records on separate devices. Review the Cloud Cutover report and all organisation queues: pending edits, deletions, failed changes, conflicts and private uploads must be reconciled. Aggregate record counts cannot prove an operation was applied." },
    { id: "hosted-security", title: "Protected hosted security checks reviewed", detail: "Review the live RLS and Storage acceptance results against the intended migration marker. Confirm tenant isolation, office/field/customer boundaries and denied revoked or inactive access. A local synthetic rehearsal alone does not verify the hosted deployment." },
    { id: "production-backup", title: "Protected production backup and restore reviewed", detail: "Before a production schema change, review a protected database export covering business records, Auth, Storage metadata, grants, policies and migration history, plus separately backed-up object bytes where present. Record capture time and hashes in the protected recovery record and verify a restore in an isolated full Supabase environment. Keep dumps and credentials out of this checklist and GitHub." },
    { id: "upgrade-rehearsal", title: "Upgrade and recovery evidence reviewed", detail: "Review the frozen migration sequence, existing-data preservation and full Supabase restore/upgrade rehearsal. The synthetic CI rehearsal is separate from a reviewed restore of the actual production backup and its recovery procedure." },
    { id: "production-authorisation", title: "Separate production migration authorisation recorded", detail: "Recheck the live baseline and review the backup, recovery procedure and rehearsal evidence. Obtain explicit authorisation for the exact production migration sequence before execution. Marking this item only records that review; it does not grant authorisation or apply migrations." },
  );
  return checks;
}

function requirementKey(mode: CloudMode, check: ReleaseRequirement) {
  // Wording changes invalidate confirmations automatically, even without a version bump.
  return JSON.stringify([RELEASE_REQUIREMENTS_VERSION, mode, check.id, check.title, check.detail]);
}

export function releaseEvidence(mode: CloudMode, check: ReleaseRequirement, complete: boolean, now = new Date()): ReleaseEvidence {
  return { id: check.id, complete, requirement: requirementKey(mode, check), ...(complete ? { reviewedAt: now.toISOString() } : {}) };
}

export function reconcileReleaseEvidence(mode: CloudMode, saved: unknown, definitions = releaseRequirements(mode)) {
  const records = Array.isArray(saved) ? saved : [];
  return definitions.map((check) => {
    const matches = records.filter((row) => row && typeof row === "object" && row.id === check.id);
    const evidence = matches.length === 1 ? matches[0] : undefined;
    const complete = evidence?.complete === true
      && evidence.requirement === requirementKey(mode, check)
      && typeof evidence.reviewedAt === "string"
      && Number.isFinite(Date.parse(evidence.reviewedAt));
    return { ...check, complete, reviewedAt: complete ? evidence.reviewedAt as string : undefined };
  });
}
