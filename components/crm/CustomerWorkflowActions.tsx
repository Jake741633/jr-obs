"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CustomerQuickActions } from "./CustomerQuickActions";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { TextareaField } from "../ui/FormField";
import { savedIdentityIndex } from "../../lib/assistantIdentity";
import { contactEmailHref, contactPhoneHref } from "../../lib/contactLinks";
import { canEditFinance } from "../../lib/cloud/permissions";
import { useCloudIdentity } from "../../lib/cloud/useCloudIdentity";
import { getSyncQueue } from "../../lib/cloud/repository";
import { queueTargetSyncState } from "../../lib/cloud/repository-core.mjs";
import { canonicalJobStatuses, normaliseJobStatus, transitionJobStatus } from "../../lib/jobManagement-core.mjs";
import { makeId } from "../../lib/storage";
import type { Customer, CustomerInteraction, CustomerProfile, Job, JobTimelineEntry } from "../../lib/models";

type Store<T> = { items: T[]; isReady: boolean; createItem: (item: T) => T; updateItem: (id: string, update: (current: T) => T) => T };
type Props = { customerId: string; customers: Pick<Store<Customer>, "items" | "isReady">; jobs: Store<Job>; timeline: Store<JobTimelineEntry>; profiles: Store<CustomerProfile>; interactions: Store<CustomerInteraction> };
type Scope = object;
type CompletionDraft = { scope: Scope; customerCreatedAt: string; job: Job | null; expected: string; saved: boolean };
type PendingNote = { scope: Scope; customerCreatedAt: string; jobCreatedAt: string; jobTitle: string; note: JobTimelineEntry };
type ReviewDraft = {
  scope: Scope; customerCreatedAt: string; contactSnapshot: string; channel: "Text" | "Email"; recipient: string; body: string; opened: boolean;
  confirmedAt: string; interaction: CustomerInteraction | null; interactionSaved: boolean; interactionSource?: CustomerInteraction[];
  profileId: string; profileTarget?: { id: string; createdAt: string } | null; done: boolean;
};
const buttonClass = "min-h-12 rounded-xl border border-slate-700 px-4 text-sm font-semibold disabled:opacity-40";
function eligibleJob(job: Job) {
  return (canonicalJobStatuses.includes(job.status) || job.status === "Lead" || job.status === "In progress")
    && !["Complete", "Invoiced", "Paid", "Cancelled", "On hold"].includes(normaliseJobStatus(job.status));
}
function jobSnapshot(job: Job) { return JSON.stringify([job.id, job.createdAt, job.customerId, job.title, job.siteAddress, job.status]); }
function contactSnapshot(customer: Customer) { return JSON.stringify([customer.createdAt, customer.name, customer.phone, customer.email]); }
function sameEvidence<T extends object>(current: T, expected: T) { return (Object.keys(expected) as (keyof T)[]).every(key => current[key] === expected[key]); }

export function CustomerWorkflowActions(props: Props) {
  const identity = useCloudIdentity();
  const key = JSON.stringify([props.customerId, identity.mode, identity.identity?.organisationId, identity.identity?.userId, identity.identity?.role, identity.identity?.customerSourceId]);
  return <CustomerWorkflowSession key={key} {...props} identity={identity} />;
}

function CustomerWorkflowSession({ customerId, customers, jobs, timeline, profiles, interactions, identity }: Props & { identity: ReturnType<typeof useCloudIdentity> }) {
  // A route/account change remounts this session and invalidates its old callbacks.
  // Source loading retains it, so a pending draft or timeline retry is not lost.
  const scope = useMemo(() => ({}), []);
  const allowed = identity.mode === "local" || canEditFinance(identity.identity?.role);
  const ready = identity.isReady && [customers, jobs, timeline, profiles, interactions].every(store => store.isReady);
  const latest = useRef({ scope, ready: false, allowed: false, customers, jobs, timeline, profiles, interactions });
  useLayoutEffect(() => {
    latest.current = { scope, ready, allowed, customers, jobs, timeline, profiles, interactions };
    return () => { latest.current = { ...latest.current, ready: false, allowed: false }; };
  }, [scope, ready, allowed, customers, jobs, timeline, profiles, interactions]);
  const [completion, setCompletion] = useState<CompletionDraft | null>(null);
  const completionRef = useRef<CompletionDraft | null>(null);
  const [review, setReview] = useState<ReviewDraft | null>(null);
  const reviewRef = useRef<ReviewDraft | null>(null);
  const [pendingNotes, setPendingNotes] = useState<PendingNote[]>([]);
  const savedNoteIds = useRef(new Set<string>());
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const panelKind = completion ? "completion" : review ? "review" : "";
  useEffect(() => { if (panelKind) panel.current?.scrollIntoView({ block: "start", behavior: "smooth" }); }, [panelKind]);
  const customer = savedIdentityIndex(customers.items).unique.get(customerId);
  const candidates = savedIdentityIndex(jobs.items).selectable.filter(job => job.customerId === customerId && eligibleJob(job));
  const visibleNotes = pendingNotes.filter(item => item.scope === scope);

  function requireCustomer(createdAt?: string) {
    const current = latest.current;
    if (current.scope !== scope || !current.ready || !current.allowed) throw new Error("Wait for this account's authorised customer records. These changes are managed by the office.");
    const saved = savedIdentityIndex(current.customers.items).unique.get(customerId);
    if (!saved || (createdAt !== undefined && saved.createdAt !== createdAt)) throw new Error("The original customer is unavailable or has an ambiguous or replaced identity. Review the customer records.");
    return saved;
  }
  function checkSync(table: string, sourceId: string, collectionKey?: string) {
    if (identity.mode === "local") return;
    const state = queueTargetSyncState(getSyncQueue(), { table, sourceId, collectionKey }, navigator.onLine);
    if (state === "Failed" || state === "Conflict") throw new Error("Resolve this record's failed or conflicting sync before changing it.");
  }
  function requireSelectedJob(active: CompletionDraft) {
    requireCustomer(active.customerCreatedAt);
    const current = savedIdentityIndex(latest.current.jobs.items).unique.get(active.job?.id ?? "");
    if (!current || current.customerId !== customerId || !eligibleJob(current) || jobSnapshot(current) !== active.expected) throw new Error("The selected job changed or is unavailable. Choose and review its current record again.");
    checkSync("jobs", current.id);
    return current;
  }
  function openCompletion() {
    try {
      const saved = requireCustomer();
      if (reviewRef.current || completionRef.current) throw new Error("Finish or close the open action first.");
      const next = { scope, customerCreatedAt: saved.createdAt, job: null, expected: "", saved: false };
      completionRef.current = next; setCompletion(next); setError(""); setMessage("");
    } catch (error) { setError(error instanceof Error ? error.message : "Completion is unavailable."); }
  }
  function chooseJob(active: CompletionDraft, id: string) {
    if (completionRef.current !== active || active.scope !== scope) return;
    try {
      requireCustomer(active.customerCreatedAt);
      const selected = savedIdentityIndex(latest.current.jobs.items).unique.get(id);
      if (!selected || selected.customerId !== customerId || !eligibleJob(selected)) throw new Error("Choose an available job linked to this customer.");
      const next = { ...active, job: selected, expected: jobSnapshot(selected) };
      completionRef.current = next; setCompletion(next); setError("");
    } catch (error) { completionRef.current = null; setCompletion(null); setError(error instanceof Error ? error.message : "This job is unavailable."); }
  }
  function saveNote(pending: PendingNote) {
    requireCustomer(pending.customerCreatedAt);
    const currentJob = savedIdentityIndex(latest.current.jobs.items).unique.get(pending.note.jobId);
    if (!currentJob || currentJob.customerId !== customerId || currentJob.createdAt !== pending.jobCreatedAt) throw new Error("The original linked job is unavailable. Review it before retrying its completion note.");
    const matches = latest.current.timeline.items.filter(item => item.id === pending.note.id);
    if (matches.length > 1 || (matches[0] && !sameEvidence(matches[0], pending.note))) throw new Error("This timeline identity contains different or ambiguous evidence. Review the saved timeline.");
    if (!matches.length && !savedNoteIds.current.has(pending.note.id)) latest.current.timeline.createItem(pending.note);
    savedNoteIds.current.add(pending.note.id);
  }
  function completeJob(active: CompletionDraft) {
    if (completionRef.current !== active || active.scope !== scope || active.saved || !active.job) return;
    let note: JobTimelineEntry | null = null;
    try {
      const selected = requireSelectedJob(active);
      if (!window.confirm(`Mark ${selected.title} at ${selected.siteAddress} complete?`)) return;
      if (completionRef.current !== active) return;
      requireSelectedJob(active);
      latest.current.jobs.updateItem(selected.id, current => {
        if (current.customerId !== customerId || !eligibleJob(current) || jobSnapshot(current) !== active.expected) throw new Error("This job changed before the save. Review its current stage and details.");
        const result = transitionJobStatus({ job: current, nextStatus: "Complete", now: new Date().toISOString(), timelineId: makeId("timeline"), completedBy: "JR OS CRM" });
        note = result.timelineEntry;
        return result.job;
      });
    } catch (error) { setMessage(""); setError(`Completion could not be confirmed. The selection is retained. ${error instanceof Error ? error.message : "Please retry."}`); return; }
    active.saved = true; completionRef.current = null; setCompletion(null); setError("");
    setMessage(`${active.job.title} completion saved on this device. Check sync status before switching devices.`);
    if (note) {
      const pending = { scope, customerCreatedAt: active.customerCreatedAt, jobCreatedAt: active.job.createdAt, jobTitle: active.job.title, note };
      try { saveNote(pending); }
      catch (error) { setPendingNotes(current => [...current, pending]); setMessage(`Job completion saved on this device; its timeline note needs retrying below. ${error instanceof Error ? error.message : ""}`); }
    }
  }
  function retryNote(pending: PendingNote) {
    if (pending.scope !== scope || savedNoteIds.current.has(pending.note.id)) return;
    try { saveNote(pending); setPendingNotes(current => current.filter(item => item !== pending)); setError(""); setMessage("Completion note saved on this device. Check sync status before switching devices."); }
    catch (error) { setError(`The completed job is unchanged. ${error instanceof Error ? error.message : "Its note could not be saved."}`); }
  }
  function showReview(next: ReviewDraft | null) { reviewRef.current = next; setReview(next); }
  function openReview() {
    try {
      const saved = requireCustomer();
      if (reviewRef.current || completionRef.current) throw new Error("Finish or close the open action first.");
      const phone = contactPhoneHref(saved.phone), email = contactEmailHref(saved.email);
      if (!phone && !email) throw new Error("Review the customer's phone or email format first.");
      const firstName = saved.name.trim().split(/\s+/)[0] || saved.name;
      showReview({ scope, customerCreatedAt: saved.createdAt, contactSnapshot: contactSnapshot(saved), channel: phone ? "Text" : "Email", recipient: phone ? saved.phone : saved.email,
        body: `Hi ${firstName}, thank you for choosing JR Electrical Services. If you were happy with the work, would you mind leaving us a Google review? It really helps the business. Kind regards, Jake`,
        opened: false, confirmedAt: "", interaction: null, interactionSaved: false, profileId: "", done: false });
      setError(""); setMessage("");
    } catch (error) { setError(error instanceof Error ? error.message : "Review preparation is unavailable."); }
  }
  function editReview(active: ReviewDraft, changes: Partial<Pick<ReviewDraft, "body" | "channel">>) {
    if (reviewRef.current !== active || active.confirmedAt || active.scope !== scope) return;
    try {
      const saved = requireCustomer(active.customerCreatedAt);
      if (contactSnapshot(saved) !== active.contactSnapshot) throw new Error("Customer contact details changed. Close this draft and prepare the message again.");
      const channel = changes.channel ?? active.channel;
      if (channel !== "Text" && channel !== "Email") throw new Error("Choose Text or Email.");
      showReview({ ...active, ...changes, channel, recipient: channel === "Text" ? saved.phone : saved.email, opened: false }); setError("");
    } catch (error) { setError(error instanceof Error ? error.message : "Review the saved contact."); }
  }
  function openComposer(active: ReviewDraft) {
    if (reviewRef.current !== active || active.scope !== scope || active.confirmedAt) return;
    try {
      const saved = requireCustomer(active.customerCreatedAt);
      if (contactSnapshot(saved) !== active.contactSnapshot) throw new Error("Customer contact details changed. Close this draft and prepare the message again.");
      if (!active.body.trim()) throw new Error("Add the review request message before opening your messaging app.");
      const target = active.channel === "Text" ? contactPhoneHref(saved.phone)?.replace("tel:", "sms:") : contactEmailHref(saved.email);
      if (!target) throw new Error("Review the selected contact format before preparing the message.");
      const href = active.channel === "Text" ? `${target}?body=${encodeURIComponent(active.body)}` : `${target}?subject=${encodeURIComponent("JR Electrical Services review request")}&body=${encodeURIComponent(active.body)}`;
      window.location.assign(href);
      showReview({ ...active, opened: true }); setError(""); setMessage("Message prepared for your messaging app. Send it there, then return here to record that you sent it.");
    } catch (error) { setError(`The message has not been recorded as sent. ${error instanceof Error ? error.message : "The messaging app could not be opened."}`); }
  }
  function currentProfile() {
    const matches = latest.current.profiles.items.filter(item => item.customerId === customerId);
    if (matches.length > 1 || (matches[0] && !savedIdentityIndex(latest.current.profiles.items).unique.has(matches[0].id))) throw new Error("The customer care profile is ambiguous. Review its records before logging a request.");
    const profile = matches[0];
    if (profile && !["Not requested", "Requested", "Received"].includes(profile.reviewStatus)) throw new Error("Review the saved review status before logging a request.");
    return profile;
  }
  function reviewProfile(active: ReviewDraft) {
    const profile = currentProfile();
    if (active.profileTarget === undefined) active.profileTarget = profile ? { id: profile.id, createdAt: profile.createdAt } : null;
    const expected = active.profileTarget ?? (active.profileId ? { id: active.profileId, createdAt: active.confirmedAt } : null);
    if ((active.profileTarget && !profile) || (profile && (!expected || profile.id !== expected.id || profile.createdAt !== expected.createdAt))) {
      throw new Error("The customer care profile was replaced or changed identity. Review its records before logging the remaining status.");
    }
    return profile;
  }
  function recordReview(active: ReviewDraft) {
    if (reviewRef.current !== active || active.scope !== scope || !active.opened || active.done) return;
    try {
      requireCustomer(active.customerCreatedAt);
      reviewProfile(active);
      active.confirmedAt ||= new Date().toISOString();
      active.interaction ??= { id: makeId("interaction"), customerId, type: "Review request", summary: "Review request sent (confirmed by user).", outcome: `User confirmed sending by ${active.channel} to ${active.recipient}. Delivery has not been verified.`, completedBy: "JR OS CRM", interactionAt: active.confirmedAt, createdAt: active.confirmedAt };
      const matches = latest.current.interactions.items.filter(item => item.id === active.interaction!.id);
      if (matches.length > 1 || (matches[0] && !sameEvidence(matches[0], active.interaction))) throw new Error("This request's timeline identity is ambiguous or has different details. Review the customer timeline.");
      if (!matches.length && active.interactionSaved && latest.current.interactions.items !== active.interactionSource) throw new Error("The saved request is no longer in the refreshed timeline. Review it before retrying the customer care status.");
      if (!matches.length && !active.interactionSaved) latest.current.interactions.createItem(active.interaction);
      active.interactionSource ??= latest.current.interactions.items;
      active.interactionSaved = true;
      checkSync("cloud_collections", active.interaction.id, "jr-os-customer-interactions");
      const profile = reviewProfile(active);
      if (profile) {
        checkSync("cloud_collections", profile.id, "jr-os-customer-profiles");
        latest.current.profiles.updateItem(profile.id, current => {
          if (current.customerId !== customerId || current.createdAt !== profile.createdAt) throw new Error("The customer care profile has changed. Review it before retrying.");
          if (current.reviewStatus === "Received") return current;
          if (current.reviewStatus !== "Not requested" && current.reviewStatus !== "Requested") throw new Error("Review the saved review status before retrying.");
          if (current.reviewStatus === "Requested" && current.reviewRequestedAt) {
            const requestedAt = Date.parse(current.reviewRequestedAt);
            if (!Number.isFinite(requestedAt)) throw new Error("The saved review request date needs review before retrying.");
            if (requestedAt >= Date.parse(active.confirmedAt)) return current;
          }
          return { ...current, reviewStatus: "Requested", reviewRequestedAt: active.confirmedAt, updatedAt: new Date().toISOString() };
        });
      } else {
        active.profileId ||= makeId("profile");
        latest.current.profiles.createItem({ id: active.profileId, customerId, tags: [], preferredContact: active.channel === "Text" ? "Phone" : "Email", nextFollowUpDate: "", followUpReason: "", reviewStatus: "Requested", reviewRequestedAt: active.confirmedAt, portalEnabled: false, portalNote: "", createdAt: active.confirmedAt, updatedAt: active.confirmedAt });
      }
      active.done = true; showReview(null); setError(""); setMessage("Your confirmation that the request was sent is saved on this device. Existing received reviews and newer request dates are retained. Check sync status before switching devices.");
    } catch (error) {
      showReview({ ...active }); setMessage(""); setError(`${active.interactionSaved ? "The request is saved in the timeline, but its customer care status needs retrying." : "The sent-request record could not be confirmed."} Keep this page open and retry; this will not send the message again. ${error instanceof Error ? error.message : ""}`);
    }
  }

  if (!ready || !customer) return null;
  return <div className="space-y-4">
    <CustomerQuickActions customer={customer} activeJob={candidates.length === 1 ? candidates[0] : undefined} canComplete={allowed && candidates.length > 0} canRequestReview={allowed} onMarkComplete={openCompletion} onRequestReview={openReview} />
    {error ? <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/5 p-4 text-sm text-red-200">{error}</p> : null}
    {message ? <p role="status" className="rounded-xl border border-cyan-400/30 bg-cyan-400/5 p-4 text-sm text-cyan-200">{message}</p> : null}
    <div ref={panel} className="scroll-mt-24">
      {completion && completion.scope === scope ? <Card aria-label="Complete a customer job" className="space-y-4">
        <h2 className="text-lg font-bold">Choose the job you finished</h2><p className="text-sm text-slate-400">This changes the selected job to Complete. Review testing, certificates and handover in the job workspace.</p>
        <label className="grid gap-2 text-sm font-semibold"><span>Job to complete</span><select value={completion.job?.id ?? ""} onChange={event => chooseJob(completion, event.target.value)} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base"><option value="" disabled>Choose a linked job</option>{completion.job && !candidates.some(job => job.id === completion.job!.id) ? <option value={completion.job.id}>Selected job unavailable</option> : null}{candidates.map(job => <option key={job.id} value={job.id}>{job.title} · {job.siteAddress} · {normaliseJobStatus(job.status)}</option>)}</select></label>
        {completion.job ? <p className="break-words text-sm">{completion.job.title} · {completion.job.siteAddress} · {normaliseJobStatus(completion.job.status)} → Complete</p> : null}
        <div className="flex flex-col gap-3 sm:flex-row"><Button disabled={!completion.job || !allowed} onClick={() => completeJob(completion)}>Mark selected job complete</Button><button type="button" className={buttonClass} onClick={() => { if (completionRef.current !== completion) return; completionRef.current = null; setCompletion(null); setError(""); }}>Close completion</button></div>
      </Card> : null}
      {review && review.scope === scope ? <Card aria-label="Prepare a review request" className="space-y-4">
        <h2 className="text-lg font-bold">Prepare a review request</h2><p className="text-sm text-slate-400">Send the message in your text or email app, then return here to record it. Preparing or opening a message does not mark it as sent.</p>
        <label className="grid gap-2 text-sm font-semibold"><span>Send using</span><select value={review.channel} disabled={Boolean(review.confirmedAt)} onChange={event => editReview(review, { channel: event.target.value as ReviewDraft["channel"] })} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base"><option value="Text" disabled={!contactPhoneHref(customer.phone)}>Text</option><option value="Email" disabled={!contactEmailHref(customer.email)}>Email</option></select></label>
        <p className="break-all text-sm">To: {review.recipient}</p><TextareaField label="Review request message" value={review.body} disabled={Boolean(review.confirmedAt)} onChange={event => editReview(review, { body: event.target.value })} />
        <p className="text-xs text-slate-400">Add your Google review link to the message if needed. Keep this page open while sending and saving; leaving loses the unsaved draft or remaining save steps.</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">{!review.confirmedAt ? <Button onClick={() => openComposer(review)}>{review.channel === "Text" ? "Open text app" : "Open email app"}</Button> : null}<Button disabled={!review.opened || !allowed} onClick={() => recordReview(review)}>{review.confirmedAt ? "Retry request record" : "Record request as sent"}</Button><button type="button" className={buttonClass} onClick={() => { if (reviewRef.current !== review) return; showReview(null); setError(""); setMessage(review.interactionSaved ? "The saved request remains in the customer timeline. Review the customer care status separately." : "Review draft closed. No new request was recorded."); }}>{review.interactionSaved ? "Keep saved timeline record" : "Close review draft"}</button></div>
      </Card> : null}
    </div>
    {visibleNotes.length ? <Card aria-label="Completion notes to retry" className="space-y-3 border-amber-400/30"><h2 className="font-bold">Completion notes need retrying</h2><p className="text-sm text-slate-400">The job changes are saved on this device. Keep this page open to retry their timeline notes; leaving loses these unsaved notes.</p>{visibleNotes.map(pending => <div key={pending.note.id} className="rounded-xl border border-slate-700 p-3"><p className="break-words font-semibold">{pending.jobTitle}</p><p className="mt-1 text-sm">{pending.note.note}</p><button type="button" className={`${buttonClass} mt-3`} onClick={() => retryNote(pending)}>Retry completion note</button></div>)}</Card> : null}
  </div>;
}
