"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { InputField, TextareaField } from "../ui/FormField";
import { savedIdentityIndex } from "../../lib/assistantIdentity";
import { canEditFinance } from "../../lib/cloud/permissions";
import { useCloudIdentity } from "../../lib/cloud/useCloudIdentity";
import { getSyncQueue } from "../../lib/cloud/repository";
import { queueTargetSyncState } from "../../lib/cloud/repository-core.mjs";
import { crmLeadStages, normaliseLeadStage } from "../../lib/crmPro";
import { plannerViewDate } from "../../lib/scheduling";
import { makeId } from "../../lib/storage";
import type { Builder, Customer, LeadActivity, LeadPriority, LeadSource, LeadStage, SalesLead } from "../../lib/models";

type Store<T> = { items: T[]; isReady: boolean; createItem: (item: T) => T; updateItem: (id: string, update: (current: T) => T) => T };
type Stores = { leads: Store<SalesLead>; activities: Store<LeadActivity>; customers: Pick<Store<Customer>, "items" | "isReady">; builders: Pick<Store<Builder>, "items" | "isReady"> };
type Party = { kind: "customer"; record: Customer } | { kind: "builder"; record: Builder };
export const leadSources: LeadSource[] = ["Website", "Google", "Referral", "Builder", "Repeat customer", "Social media", "MyJobsQuote", "MyBuilder", "Checkatrade", "Other"];
const priorities: LeadPriority[] = ["Low", "Normal", "High", "Urgent"];
const blank = { name: "", company: "", email: "", phone: "", siteAddress: "", workRequired: "", source: "Website" as LeadSource, priority: "Normal" as LeadPriority, estimatedValue: "0", nextAction: "Call customer", followUpDate: "", notes: "" };
type Form = typeof blank;
type Prepared = { record: SalesLead; activity: LeadActivity; source?: SalesLead[] };
type Common = { scope: object; parties: Party[]; saved: boolean; prepared?: Prepared };
type Capture = Common & { kind: "capture"; form: Form; linkIssue: string };
type Stage = Common & { kind: "stage"; original: SalesLead; expected: string; target: LeadStage; method: string };
type Draft = Capture | Stage;
const fieldClass = "min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base disabled:opacity-50";
function knownStage(stage: SalesLead["stage"]) { return [...crmLeadStages, "New enquiry", "Survey booked", "Quote required", "Quote sent", "Won"].includes(stage); }
function stageSnapshot(lead: SalesLead) {
  return JSON.stringify([lead.id, lead.createdAt, lead.name, lead.company, lead.phone, lead.email, lead.workRequired, lead.stage, lead.customerId, lead.builderId, lead.jobId, lead.quoteId, lead.surveyId, lead.plannerEntryId, lead.nextAction, lead.followUpDate, lead.lastContactAt, lead.completedAt]);
}
function partySnapshot(party: Party) {
  const record = party.record;
  return JSON.stringify([party.kind, record.id, record.createdAt, record.phone, record.email, record.address, party.kind === "customer" ? party.record.name : [party.record.companyName, party.record.contactName]]);
}
function sameEvidence<T extends object>(current: T, expected: T) { return (Object.keys(expected) as (keyof T)[]).every(key => current[key] === expected[key]); }

/** One reviewed action per account, kept outside cards and filters until all writes finish. */
export function useLeadPipelineActions(stores: Stores) {
  const identity = useCloudIdentity();
  const account = JSON.stringify([identity.mode, identity.identity?.organisationId, identity.identity?.userId, identity.identity?.role, identity.identity?.customerSourceId]);
  const scope = useMemo(() => ({ account }), [account]);
  const allowed = identity.mode === "local" || canEditFinance(identity.identity?.role);
  const ready = identity.isReady && Object.values(stores).every(store => store.isReady);
  const latest = useRef({ scope, stores, ready: false, allowed: false });
  useLayoutEffect(() => {
    latest.current = { scope, stores, ready, allowed };
    return () => { latest.current = { ...latest.current, ready: false, allowed: false }; };
  }, [scope, stores, ready, allowed]);
  const [draft, setDraft] = useState<Draft | null>(null), draftRef = useRef<Draft | null>(null);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const panelRef = useRef<HTMLDivElement>(null), panelOpen = Boolean(draft);
  useEffect(() => { if (panelOpen || error || message) panelRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }); }, [panelOpen, error, message]);
  function showDraft(next: Draft | null) { draftRef.current = next; setDraft(next); }
  function requireAccess() {
    const current = latest.current;
    if (current.scope !== scope || !current.ready || !current.allowed) throw new Error("Wait for this account's authorised records. Lead capture and stage changes are managed by the office.");
    return current.stores;
  }
  function checkSync(table: string, sourceId: string, collectionKey?: string) {
    if (identity.mode === "local") return;
    const state = queueTargetSyncState(getSyncQueue(), { table, sourceId, collectionKey }, navigator.onLine);
    if (state === "Failed" || state === "Conflict") throw new Error("Resolve the failed or conflicting sync for this record before retrying.");
  }
  function party(kind: Party["kind"], id: string): Party {
    const current = requireAccess();
    checkSync(kind === "customer" ? "customers" : "builders", id);
    if (kind === "customer") {
      const record = savedIdentityIndex(current.customers.items).unique.get(id);
      if (record) return { kind, record };
    } else {
      const record = savedIdentityIndex(current.builders.items).unique.get(id);
      if (record) return { kind, record };
    }
    throw new Error("The linked contact is missing or ambiguous. Choose a unique saved contact or explicitly continue unlinked.");
  }
  function checkParties(active: Draft, initial: boolean) {
    for (const expected of active.parties) {
      const current = party(expected.kind, expected.record.id);
      if (current.record.createdAt !== expected.record.createdAt || (initial && partySnapshot(current) !== partySnapshot(expected))) throw new Error("The linked contact changed or was replaced. Close this action and review the contact again.");
    }
  }
  function linkedForm(form: Form, selected: Party): Form {
    const record = selected.record;
    return { ...form, name: selected.kind === "customer" ? selected.record.name : selected.record.contactName, company: selected.kind === "builder" ? selected.record.companyName : "", email: record.email, phone: record.phone, siteAddress: record.address, source: selected.kind === "customer" ? "Repeat customer" : "Builder" };
  }
  function openCapture(parameters?: URLSearchParams) {
    try {
      requireAccess();
      if (draftRef.current) throw new Error("Finish or close the open lead action first.");
      let form = { ...blank }, parties: Party[] = [], linkIssue = "";
      const customerId = parameters?.get("customerId"), builderId = parameters?.get("builderId"), source = parameters?.get("source");
      if (source && leadSources.includes(source as LeadSource)) form.source = source as LeadSource;
      if (parameters?.has("customerId") || parameters?.has("builderId")) {
        try {
          if (parameters.has("customerId") && parameters.has("builderId")) throw new Error("This link names two contacts. Choose one saved contact or explicitly continue unlinked.");
          const selected = party(parameters.has("customerId") ? "customer" : "builder", customerId ?? builderId ?? "");
          parties = [selected]; form = linkedForm(form, selected);
        } catch (error) { linkIssue = error instanceof Error ? error.message : "Review the linked contact."; }
      }
      showDraft({ scope, kind: "capture", form, parties, linkIssue, saved: false }); setError(""); setMessage("");
    } catch (error) { setError(error instanceof Error ? error.message : "Lead capture is unavailable."); }
  }
  function editCapture(active: Capture, changes: Partial<Form>) {
    if (draftRef.current !== active || active.scope !== scope || active.saved) return;
    try { requireAccess(); showDraft({ ...active, form: { ...active.form, ...changes }, prepared: undefined }); setError(""); }
    catch (error) { setError(error instanceof Error ? error.message : "Review the lead."); }
  }
  function selectParty(active: Capture, kind: Party["kind"], id: string) {
    if (draftRef.current !== active || active.scope !== scope || active.saved) return;
    try {
      requireAccess();
      const selected = id ? party(kind, id) : null;
      showDraft({ ...active, parties: selected ? [selected] : [], form: selected ? linkedForm(active.form, selected) : active.form, linkIssue: "", prepared: undefined }); setError("");
    } catch (error) { setError(error instanceof Error ? error.message : "Review the contact."); }
  }
  function liveLead(id: string) {
    const current = savedIdentityIndex(requireAccess().leads.items).unique.get(id);
    if (!current) throw new Error("The original lead is missing or has an ambiguous identity. Review the saved records.");
    checkSync("cloud_collections", id, "jr-os-leads");
    return current;
  }
  function reviewStage(lead: SalesLead, target: LeadStage, method = "Pipeline") {
    try {
      requireAccess();
      if (draftRef.current) throw new Error("Finish or close the open lead action first.");
      const current = liveLead(lead.id);
      if (!knownStage(current.stage) || !crmLeadStages.includes(target)) throw new Error("Review the unsupported saved stage before changing this lead.");
      if (stageSnapshot(current) !== stageSnapshot(lead)) throw new Error("This lead changed. Review its current record before changing stage.");
      if (normaliseLeadStage(current.stage) === target) return;
      const parties: Party[] = [];
      if (current.customerId) parties.push(party("customer", current.customerId));
      if (current.builderId) parties.push(party("builder", current.builderId));
      showDraft({ scope, kind: "stage", original: current, expected: stageSnapshot(current), target, method, parties, saved: false }); setError(""); setMessage("");
    } catch (error) { setError(error instanceof Error ? error.message : "Stage change is unavailable."); }
  }
  function original(active: Draft, initial: boolean) {
    const current = requireAccess();
    checkParties(active, initial);
    const expected = active.kind === "stage" ? active.original : active.prepared!.record;
    checkSync("cloud_collections", expected.id, "jr-os-leads");
    const index = savedIdentityIndex(current.leads.items);
    // A successful create can precede React's next frame. Only the unchanged pre-create array may use that receipt.
    const record = index.unique.get(expected.id) ?? (active.kind === "capture" && active.saved && !index.counts.has(expected.id) && current.leads.items === active.prepared?.source ? active.prepared.record : undefined);
    if (!record || record.createdAt !== expected.createdAt || record.customerId !== expected.customerId || record.builderId !== expected.builderId) throw new Error("The original lead was removed, replaced, relinked or has an ambiguous identity. Review it before retrying.");
    if (initial && active.kind === "stage" && stageSnapshot(record) !== active.expected) throw new Error("This lead changed. Close the action and review its current stage again.");
    return record;
  }
  function checkActivity(activity: LeadActivity) {
    const current = requireAccess();
    checkSync("cloud_collections", activity.id, "jr-os-lead-activities");
    const matches = current.activities.items.filter(item => item.id === activity.id);
    if (matches.length > 1 || (matches[0] && !sameEvidence(matches[0], activity))) throw new Error("A history identity is ambiguous or contains different evidence. Review the saved history.");
    return matches.length > 0;
  }
  function prepareCapture(active: Capture): Prepared {
    const form = active.form, value = form.estimatedValue.trim();
    if (active.linkIssue) throw new Error(active.linkIssue);
    if (!form.name.trim() || !form.workRequired.trim()) throw new Error("Enter the contact name and work required.");
    if (!leadSources.includes(form.source) || !priorities.includes(form.priority)) throw new Error("Choose a valid source and priority.");
    if (!/^\d+(?:\.\d{1,2})?$/.test(value) || !Number.isSafeInteger(Math.round(Number(value) * 100))) throw new Error("Enter a non-negative estimated value with at most two decimal places.");
    if (form.followUpDate && plannerViewDate(form.followUpDate) !== form.followUpDate) throw new Error("Choose a valid follow-up date.");
    const at = new Date().toISOString(), id = makeId("lead");
    const record: SalesLead = { ...form, id, name: form.name.trim(), workRequired: form.workRequired.trim(), estimatedValue: Number(value), stage: "New Lead", customerId: active.parties.find(item => item.kind === "customer")?.record.id, builderId: active.parties.find(item => item.kind === "builder")?.record.id, createdAt: at, updatedAt: at };
    return { record, activity: { id: makeId("activity"), leadId: id, type: "Note", summary: `Enquiry captured from ${record.source}.`, completedBy: "JR OS CRM", completedAt: at, createdAt: at } };
  }
  function save(active: Draft) {
    if (draftRef.current !== active || active.scope !== scope) return;
    try {
      const current = requireAccess();
      checkParties(active, !active.saved);
      if (active.kind === "stage") original(active, !active.saved);
      if (!active.prepared) {
        if (active.kind === "capture") active.prepared = prepareCapture(active);
        else {
          const at = new Date().toISOString();
          active.prepared = { record: active.original, activity: { id: makeId("activity"), leadId: active.original.id, type: "Stage change", summary: `${active.method}: ${normaliseLeadStage(active.original.stage)} → ${active.target}`, completedBy: "JR OS CRM", completedAt: at, createdAt: at } };
        }
      }
      const prepared = active.prepared, at = prepared.activity.createdAt;
      checkActivity(prepared.activity);
      if (!active.saved) {
        if (active.kind === "capture") {
          checkParties(active, true);
          checkSync("cloud_collections", prepared.record.id, "jr-os-leads");
          if (savedIdentityIndex(current.leads.items).counts.has(prepared.record.id)) throw new Error("This new lead identity already exists. Review the records before retrying.");
          current.leads.createItem(prepared.record); prepared.source = current.leads.items;
        } else {
          current.leads.updateItem(active.original.id, record => {
            original(active, true);
            if (stageSnapshot(record) !== active.expected) throw new Error("This lead changed before the save. Close the action and review it again.");
            return { ...record, stage: active.target, ...(active.target === "Contacted" ? { lastContactAt: at } : {}), ...(active.target === "Completed" ? { completedAt: at } : {}), ...(active.target === "Follow-up Due" ? { nextAction: "Contact customer today" } : active.target === "Accepted" ? { nextAction: "Book work" } : {}), updatedAt: at };
          });
        }
        active.saved = true;
      }
      original(active, false);
      if (!checkActivity(prepared.activity)) requireAccess().activities.createItem(prepared.activity);
      showDraft(null); setError(""); setMessage(`${prepared.record.name}: ${active.kind === "capture" ? "lead and capture history" : `${active.target} stage and history`} saved on this device. Check sync status before switching devices.`);
    } catch (error) {
      showDraft({ ...active }); setMessage(""); setError(`${active.saved ? "The lead is saved; its history still needs saving. Retrying will only save the history." : "The lead was not saved. Your draft is retained."} ${error instanceof Error ? error.message : "Please retry."}`);
    }
  }
  const active = draft?.scope === scope ? draft : null;
  const disabled = !ready || !allowed;
  const capture = active?.kind === "capture" ? active : null;
  const panel = <div ref={panelRef} className="scroll-mt-4 space-y-3">
    {message ? <p role="status" className="rounded-xl border border-emerald-400/25 p-4 text-sm text-emerald-300">{message}</p> : null}
    {error ? <p role="alert" className="rounded-xl border border-amber-400/25 p-4 text-sm text-amber-200">{error}</p> : null}
    {!allowed ? <p className="text-sm text-amber-200">Lead capture and stage changes are managed by the office.</p> : null}
    {active ? <Card>
      <h2 className="text-xl font-bold">{active.saved ? "Finish saving lead history" : active.kind === "capture" ? "New lead" : "Review stage change"}</h2>
      <p className="mt-2 text-sm text-amber-200">Keep this page open until saving is complete. Leaving or changing account loses unsaved drafts and remaining history retries.</p>
      {!ready ? <p role="status" className="mt-3 text-sm">Waiting for records. Your action is retained.</p> : null}
      {capture && !capture.saved ? <form onSubmit={event => { event.preventDefault(); save(capture); }} className="mt-4 grid gap-4 md:grid-cols-2">
        <fieldset disabled={disabled} className="contents">
          <label className="grid gap-2 text-sm font-semibold">Link customer<select aria-label="Link customer" value={capture.parties.find(item => item.kind === "customer")?.record.id || ""} onChange={event => selectParty(capture, "customer", event.target.value)} className={fieldClass}><option value="">New or unlinked contact</option>{savedIdentityIndex(stores.customers.items).selectable.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
          <label className="grid gap-2 text-sm font-semibold">Link builder / contractor<select aria-label="Link builder / contractor" value={capture.parties.find(item => item.kind === "builder")?.record.id || ""} onChange={event => selectParty(capture, "builder", event.target.value)} className={fieldClass}><option value="">No builder linked</option>{savedIdentityIndex(stores.builders.items).selectable.map(builder => <option key={builder.id} value={builder.id}>{builder.companyName}</option>)}</select></label>
          {capture.linkIssue || capture.parties.length ? <div role={capture.linkIssue ? "alert" : undefined} className="md:col-span-2">{capture.linkIssue ? <p className="text-amber-200">{capture.linkIssue}</p> : null}<Button type="button" variant="secondary" className="min-h-12" onClick={() => selectParty(capture, "customer", "")}>Continue without a linked contact</Button></div> : null}
          <InputField label="Customer/contact" aria-label="Customer/contact" value={capture.form.name} onChange={event => editCapture(capture, { name: event.target.value })} required />
          <InputField label="Company" aria-label="Company" value={capture.form.company} onChange={event => editCapture(capture, { company: event.target.value })} />
          <InputField label="Phone" aria-label="Phone" type="tel" value={capture.form.phone} onChange={event => editCapture(capture, { phone: event.target.value })} />
          <InputField label="Email" aria-label="Email" type="email" value={capture.form.email} onChange={event => editCapture(capture, { email: event.target.value })} />
          <InputField label="Site address" aria-label="Site address" value={capture.form.siteAddress} onChange={event => editCapture(capture, { siteAddress: event.target.value })} />
          <InputField label="Estimated value (£)" aria-label="Estimated value" type="number" min="0" step="0.01" value={capture.form.estimatedValue} onChange={event => editCapture(capture, { estimatedValue: event.target.value })} required />
          <label className="grid gap-2 text-sm font-semibold">Source<select aria-label="Lead source" value={capture.form.source} onChange={event => editCapture(capture, { source: event.target.value as LeadSource })} className={fieldClass}>{leadSources.map(source => <option key={source}>{source}</option>)}</select></label>
          <label className="grid gap-2 text-sm font-semibold">Priority<select aria-label="Lead priority" value={capture.form.priority} onChange={event => editCapture(capture, { priority: event.target.value as LeadPriority })} className={fieldClass}>{priorities.map(priority => <option key={priority}>{priority}</option>)}</select></label>
          <InputField label="Next action" aria-label="Next action" value={capture.form.nextAction} onChange={event => editCapture(capture, { nextAction: event.target.value })} />
          <InputField label="Follow-up date" aria-label="Follow-up date" type="date" value={capture.form.followUpDate} onChange={event => editCapture(capture, { followUpDate: event.target.value })} />
          <TextareaField label="Work required" aria-label="Work required" value={capture.form.workRequired} onChange={event => editCapture(capture, { workRequired: event.target.value })} required />
          <TextareaField label="Notes" aria-label="Notes" value={capture.form.notes} onChange={event => editCapture(capture, { notes: event.target.value })} />
          <Button type="submit" className="min-h-12" disabled={disabled || Boolean(capture.linkIssue)}>Save lead</Button>
        </fieldset>
      </form> : active.kind === "stage" ? <><p className="mt-4 break-words font-semibold">{active.original.name}: {normaliseLeadStage(active.original.stage)} → {active.target}</p><p className="mt-2 break-words text-sm text-slate-400">{active.original.workRequired}</p>{!active.saved ? <p className="mt-2 text-sm text-slate-400">Confirm that this stage reflects the work. Contacted records contact now; Completed records completion now.</p> : null}</> : <p className="mt-4 font-semibold">{capture?.prepared?.record.name}</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        {active.saved || active.kind === "stage" ? <Button type="button" className="min-h-12" disabled={disabled} onClick={() => save(active)}>{active.saved ? "Retry lead history" : "Confirm stage change"}</Button> : null}
        {!active.saved ? <Button type="button" variant="secondary" className="min-h-12" onClick={() => { if (draftRef.current === active && active.scope === scope) { showDraft(null); setError(""); } }}>Discard lead action</Button> : null}
      </div>
    </Card> : null}
  </div>;
  return { openCapture, reviewStage, panel, ready, canStart: ready && allowed && !active, busy: Boolean(active) };
}
