"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { savedIdentityIndex } from "../../lib/assistantIdentity";
import { canEditFinance } from "../../lib/cloud/permissions";
import { useCloudIdentity } from "../../lib/cloud/useCloudIdentity";
import { getSyncQueue } from "../../lib/cloud/repository";
import { queueTargetSyncState } from "../../lib/cloud/repository-core.mjs";
import { buildFollowUpCentre, crmLeadStages, normaliseLeadStage, type CrmFollowUpItem } from "../../lib/crmPro";
import { followUpRulesError, followUpRulesSnapshot, resolveFollowUpSettings } from "../../lib/crmFollowUpSettings";
import { plannerDateKey, shiftPlannerDate } from "../../lib/scheduling";
import { makeId } from "../../lib/storage";
import type { CrmFollowUpSettings, Customer, CustomerInteraction, CustomerProfile, LeadActivity, PricingDocument, SalesLead } from "../../lib/models";

type Store<T> = { items: T[]; isReady: boolean; createItem: (item: T) => T; updateItem: (id: string, update: (current: T) => T) => T };
type Stores = { leads: Store<SalesLead>; leadActivities: Store<LeadActivity>; documents: Store<PricingDocument>; customers: Pick<Store<Customer>, "items" | "isReady">; profiles: Store<CustomerProfile>; interactions: Store<CustomerInteraction>; settingsStore: Pick<Store<CrmFollowUpSettings>, "items" | "isReady"> };
type Source = { kind: "lead"; record: SalesLead } | { kind: "quote"; record: PricingDocument } | { kind: "profile"; record: CustomerProfile };
const channels = ["Call", "Text", "Email", "WhatsApp", "Site visit"] as const;
type Channel = typeof channels[number];
type Evidence<T> = { record: T; saved: boolean; source?: T[] };
type Draft = {
  scope: object; kind: "contact" | "postpone"; item: CrmFollowUpItem; source: Source; expected: string;
  customer: Customer | null; rules: string; day: string; days: number; nextDate: string;
  channel: Channel | ""; outcome: string; saved: boolean;
  prepared?: { at: string; activity?: Evidence<LeadActivity>; interaction?: Evidence<CustomerInteraction> };
};
const fieldClass = "min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base disabled:opacity-50";
function sourceSnapshot(source: Source) {
  const record = source.record;
  const common = [record.id, record.createdAt, record.customerId];
  if (source.kind === "lead") { const lead = source.record; return JSON.stringify([...common, lead.name, lead.company, lead.phone, lead.email, lead.stage, lead.workRequired, lead.nextAction, lead.followUpDate, lead.lastContactAt, lead.lostFollowUpCompletedAt, lead.lostReason, lead.quoteId]); }
  if (source.kind === "quote") { const quote = source.record; return JSON.stringify([...common, quote.type, quote.status, quote.title, quote.number, quote.lastFollowUpAt, quote.nextFollowUpDate]); }
  return JSON.stringify([...common, source.record.nextFollowUpDate, source.record.followUpReason]);
}
function customerSnapshot(customer: Customer | null) { return customer ? JSON.stringify([customer.id, customer.createdAt, customer.name, customer.phone, customer.email]) : ""; }
function itemSnapshot(item: CrmFollowUpItem) { return JSON.stringify([item.id, item.reason, item.title, item.detail, item.dueDate, item.customerId, item.leadId, item.quoteId, item.profileId, item.phone, item.email]); }
function sameEvidence<T extends object>(current: T, expected: T) { return (Object.keys(expected) as (keyof T)[]).every(key => current[key] === expected[key]); }
function dateLabel(day: string) { return new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }

/** Lives in the page session, independently of cards disappearing, filtering or loading. */
export function useFollowUpActions(stores: Stores) {
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
  const [draft, setDraft] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const panelOpen = Boolean(draft);
  useEffect(() => { if (panelOpen || error || message) panelRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }); }, [panelOpen, error, message]);

  function showDraft(next: Draft | null) { draftRef.current = next; setDraft(next); }
  function requireAccess() {
    const current = latest.current;
    if (current.scope !== scope || !current.ready || !current.allowed) throw new Error("Wait for this account's authorised records. Follow-up changes are managed by the office.");
    return current.stores;
  }
  function checkSync(table: string, sourceId: string, collectionKey?: string) {
    if (identity.mode === "local") return;
    const state = queueTargetSyncState(getSyncQueue(), { table, sourceId, collectionKey }, navigator.onLine);
    if (state === "Failed" || state === "Conflict") throw new Error("Resolve the failed or conflicting sync for this record before retrying.");
  }
  function currentRules() {
    const resolved = resolveFollowUpSettings(requireAccess().settingsStore.items);
    const issue = resolved.error || followUpRulesError(resolved.settings);
    if (issue) throw new Error(issue);
    checkSync("cloud_collections", resolved.settings.id, "jr-os-crm-follow-up-settings");
    return resolved.settings;
  }
  function currentSource(item: CrmFollowUpItem): Source {
    const current = requireAccess();
    // A lead may also link to a quote; the exact surfaced source determines the write.
    if (item.leadId && item.id === `lead-follow-up-${item.leadId}`) {
      const record = savedIdentityIndex(current.leads.items).unique.get(item.leadId);
      if (record) return { kind: "lead", record };
    } else if (item.quoteId && item.id === `quote-follow-up-${item.quoteId}`) {
      const record = savedIdentityIndex(current.documents.items).unique.get(item.quoteId);
      if (record) return { kind: "quote", record };
    } else if (item.profileId && item.id === `customer-follow-up-${item.profileId}`) {
      const record = savedIdentityIndex(current.profiles.items).unique.get(item.profileId);
      if (record) return { kind: "profile", record };
    }
    throw new Error("The original follow-up is missing or has an ambiguous identity. Review the saved records.");
  }
  function linkedCustomer(source: Source) {
    const id = source.record.customerId;
    if (!id && source.kind === "lead") return null;
    const customer = savedIdentityIndex(requireAccess().customers.items).unique.get(id || "");
    if (!customer) throw new Error("The linked customer is missing or ambiguous. Review the saved customer records.");
    return customer;
  }
  function sourceSync(source: Source) {
    checkSync(source.kind === "quote" ? "pricing_documents" : "cloud_collections", source.record.id, source.kind === "lead" ? "jr-os-leads" : source.kind === "profile" ? "jr-os-customer-profiles" : undefined);
  }
  function liveItem(item: CrmFollowUpItem, settings: CrmFollowUpSettings) {
    const current = requireAccess(), source = currentSource(item);
    if (source.kind === "lead" && ![...crmLeadStages, "New enquiry", "Survey booked", "Quote required", "Quote sent", "Won"].includes(source.record.stage)) throw new Error("Review the lead's unsupported saved stage first.");
    const matches = buildFollowUpCentre({ ...current, leads: current.leads.items, leadActivities: current.leadActivities.items, documents: current.documents.items, customers: current.customers.items, profiles: current.profiles.items, settings }).filter(row => row.id === item.id);
    if (matches.length !== 1 || itemSnapshot(matches[0]) !== itemSnapshot(item)) throw new Error("This follow-up changed or is no longer due. Close the action and review its current record.");
    return source;
  }
  function requireOriginal(active: Draft, initial: boolean) {
    const source = currentSource(active.item), customer = linkedCustomer(source);
    if (source.kind !== active.source.kind || source.record.createdAt !== active.source.record.createdAt || source.record.customerId !== active.source.record.customerId || customer?.createdAt !== active.customer?.createdAt) throw new Error("The original record or linked customer was replaced or relinked. Review it before retrying.");
    sourceSync(source);
    if (initial) {
      const settings = currentRules();
      if (followUpRulesSnapshot(settings) !== active.rules) throw new Error("Follow-up rules changed. Close the action and review the new schedule.");
      if (plannerDateKey() !== active.day) throw new Error("The calendar day changed. Close the action and review its date again.");
      liveItem(active.item, settings);
      if (sourceSnapshot(source) !== active.expected || customerSnapshot(customer) !== customerSnapshot(active.customer)) throw new Error("The follow-up or contact details changed. Close the action and review the saved record.");
    }
    return source;
  }
  function open(item: CrmFollowUpItem, kind: Draft["kind"]) {
    try {
      requireAccess();
      if (draftRef.current) throw new Error("Finish or close the open follow-up action first.");
      const settings = currentRules(), source = liveItem(item, settings), customer = linkedCustomer(source), day = plannerDateKey();
      sourceSync(source);
      const days = kind === "postpone" ? 3 : settings.noResponseDays;
      const nextDate = kind === "contact" && (item.reason === "Lost opportunity" || source.kind === "profile") ? "" : shiftPlannerDate(day, days);
      if (nextDate === null) throw new Error("The next follow-up date needs review.");
      showDraft({ scope, kind, item, source, expected: sourceSnapshot(source), customer, rules: followUpRulesSnapshot(settings), day, days, nextDate, channel: "", outcome: "", saved: false });
      setError(""); setMessage("");
    } catch (error) { setError(error instanceof Error ? error.message : "Follow-up action is unavailable."); }
  }
  function edit(active: Draft, changes: Partial<Pick<Draft, "channel" | "outcome" | "days">>) {
    if (draftRef.current !== active || active.scope !== scope || active.saved || active.prepared) return;
    try {
      requireAccess();
      if (changes.channel !== undefined && changes.channel !== "" && !channels.includes(changes.channel)) throw new Error("Choose how you actually contacted this person.");
      const days = changes.days ?? active.days;
      if (changes.days !== undefined && ![1, 3, 7, 14].includes(days)) throw new Error("Choose one of the postponement periods.");
      showDraft({ ...active, ...changes, nextDate: changes.days === undefined ? active.nextDate : shiftPlannerDate(active.day, days)! }); setError("");
    } catch (error) { setError(error instanceof Error ? error.message : "Review the action."); }
  }
  function evidence<T extends { id: string }>(pending: Evidence<T>, store: Store<T>, key: string, save: boolean) {
    requireAccess();
    checkSync("cloud_collections", pending.record.id, key);
    const matches = store.items.filter(record => record.id === pending.record.id);
    if (matches.length > 1 || (matches[0] && !sameEvidence(matches[0], pending.record))) throw new Error("A history identity is ambiguous or contains different evidence. Review the saved history.");
    if (!matches.length && pending.saved && store.items !== pending.source) throw new Error("Previously saved history is missing from refreshed records. Review it before retrying.");
    if (save) {
      if (!matches.length && !pending.saved) store.createItem(pending.record);
      pending.source ??= store.items;
      pending.saved = true;
    }
  }
  function save(active: Draft) {
    if (draftRef.current !== active || active.scope !== scope) return;
    try {
      requireOriginal(active, !active.saved);
      if (active.kind === "contact" && !channels.includes(active.channel as Channel)) throw new Error("Choose how you actually contacted this person before saving.");
      if (!active.prepared) {
        const at = new Date().toISOString();
        const schedule = active.nextDate ? `Next follow-up: ${active.nextDate}.` : active.source.kind === "profile" ? "Customer reminder completed; no next date set." : "Lost-opportunity re-engagement completed; no next date set.";
        const summary = `Follow-up recorded by user: ${active.item.reason}. ${active.item.detail}`;
        const outcome = [active.outcome.trim(), schedule].filter(Boolean).join(" ");
        active.prepared = { at };
        if (active.kind === "contact") {
          if (active.source.kind === "lead") active.prepared.activity = { saved: false, record: { id: makeId("activity"), leadId: active.source.record.id, type: active.channel as Channel, summary: `${summary} ${outcome}`, completedBy: "JR OS CRM", completedAt: at, createdAt: at } };
          if (active.customer) active.prepared.interaction = { saved: false, record: { id: makeId("interaction"), customerId: active.customer.id, type: active.channel as Channel, summary, outcome, completedBy: "JR OS CRM", interactionAt: at, createdAt: at } };
        }
      }
      const { at, activity, interaction } = active.prepared;
      // Validate all intended history identities before changing the source.
      const current = requireAccess();
      if (activity) evidence(activity, current.leadActivities, "jr-os-lead-activities", false);
      if (interaction) evidence(interaction, current.interactions, "jr-os-customer-interactions", false);
      if (!active.saved) {
        const check = (source: Source) => {
          requireOriginal(active, true);
          if (sourceSnapshot(source) !== active.expected) throw new Error("This follow-up changed before the save. Close the action and review it again.");
        };
        if (active.source.kind === "quote") current.documents.updateItem(active.source.record.id, record => {
          check({ kind: "quote", record });
          return { ...record, nextFollowUpDate: active.nextDate, ...(active.kind === "contact" ? { lastFollowUpAt: at } : {}), updatedAt: at };
        });
        else if (active.source.kind === "lead") current.leads.updateItem(active.source.record.id, record => {
          check({ kind: "lead", record });
          if (active.kind === "postpone") return { ...record, followUpDate: active.nextDate, updatedAt: at };
          const stage = normaliseLeadStage(record.stage);
          return { ...record, stage: stage === "New Lead" || stage === "Follow-up Due" ? "Contacted" : stage, lastContactAt: at, followUpDate: active.nextDate, nextAction: stage === "Lost" ? "Re-engagement completed" : "Await response", ...(stage === "Lost" ? { lostFollowUpCompletedAt: at } : {}), updatedAt: at };
        });
        else current.profiles.updateItem(active.source.record.id, record => {
          check({ kind: "profile", record });
          return { ...record, nextFollowUpDate: active.nextDate, updatedAt: at };
        });
        active.saved = true;
      }
      if (activity) { requireOriginal(active, false); evidence(activity, requireAccess().leadActivities, "jr-os-lead-activities", true); }
      if (interaction) { requireOriginal(active, false); evidence(interaction, requireAccess().interactions, "jr-os-customer-interactions", true); }
      showDraft(null); setError(""); setMessage(`${active.item.title}: ${active.kind === "postpone" ? `postponed until ${dateLabel(active.nextDate)}` : "contact and history saved"} on this device. Check sync status before switching devices.`);
    } catch (error) {
      showDraft({ ...active }); setMessage(""); setError(`${active.saved ? "The follow-up update is saved; remaining history needs retrying. The update will not be repeated." : "The follow-up was not saved. Your action is retained."} ${error instanceof Error ? error.message : "Please retry."}`);
    }
  }
  const active = draft?.scope === scope ? draft : null;
  const panel = <div key="follow-up-actions" ref={panelRef} className="scroll-mt-4 space-y-3">
    {message ? <p role="status" className="rounded-xl border border-emerald-400/25 p-4 text-sm text-emerald-300">{message}</p> : null}
    {error ? <p role="alert" className="rounded-xl border border-amber-400/25 p-4 text-sm text-amber-200">{error}</p> : null}
    {!allowed ? <p className="text-sm text-amber-200">Contact logging and postponements are managed by the office.</p> : null}
    {active ? <Card>
      <h2 className="text-xl font-bold">{active.saved ? "Finish saving contact history" : active.kind === "contact" ? "Log completed contact" : "Postpone follow-up"}</h2>
      <p className="mt-2 break-words font-semibold">{active.item.title}</p><p className="mt-1 break-words text-sm text-slate-400">{active.item.reason} · {active.item.detail}</p>
      <p className="mt-3 text-sm text-amber-200">Keep this page open until saving is complete. Leaving or changing account loses unsaved actions and remaining history retries.</p>
      {!ready ? <p role="status" className="mt-3 text-sm">Waiting for records. Your action is retained.</p> : null}
      {active.kind === "contact" ? <>
        <p className="mt-3 text-sm text-slate-400">Record contact you have already made. Opening Call, Text or Email does not record contact or confirm delivery.</p>
        <label className="mt-4 grid gap-2 text-sm font-semibold">Contact method<select aria-label="Contact method" value={active.channel} disabled={!ready || !allowed || Boolean(active.prepared)} onChange={event => edit(active, { channel: event.target.value as Channel | "" })} className={fieldClass}><option value="">Choose contact method</option>{channels.map(channel => <option key={channel}>{channel}</option>)}</select></label>
        <label className="mt-4 grid gap-2 text-sm font-semibold">What happened? (optional)<textarea aria-label="Contact outcome" rows={3} value={active.outcome} disabled={!ready || !allowed || Boolean(active.prepared)} onChange={event => edit(active, { outcome: event.target.value })} className={`${fieldClass} py-3`} /></label>
      </> : <label className="mt-4 grid gap-2 text-sm font-semibold">Postpone for<select aria-label="Postpone for" value={active.days} disabled={!ready || !allowed || Boolean(active.prepared)} onChange={event => edit(active, { days: Number(event.target.value) })} className={fieldClass}><option value={1}>Tomorrow</option><option value={3}>3 days</option><option value={7}>1 week</option><option value={14}>2 weeks</option></select></label>}
      <p className="mt-3 text-sm">{active.nextDate ? `${active.saved ? "Saved next" : "Next"} follow-up: ${dateLabel(active.nextDate)}.` : active.source.kind === "profile" ? "This completes the customer reminder and clears its date." : "This completes lost-opportunity re-engagement without setting another date."}</p>
      <div className="mt-4 flex flex-wrap gap-3"><Button type="button" className="min-h-12" disabled={!ready || !allowed || (active.kind === "contact" && !active.channel)} onClick={() => save(active)}>{active.saved ? "Retry remaining history" : active.kind === "contact" ? "Confirm contact and save" : "Save postponement"}</Button>
        {!active.saved ? <Button type="button" variant="secondary" className="min-h-12" onClick={() => { if (draftRef.current === active && active.scope === scope) { showDraft(null); setError(""); } }}>Close action</Button> : null}</div>
    </Card> : null}
  </div>;
  return { panel, canStart: ready && allowed && !active, openContact: (item: CrmFollowUpItem) => open(item, "contact"), openPostpone: (item: CrmFollowUpItem) => open(item, "postpone") };
}
