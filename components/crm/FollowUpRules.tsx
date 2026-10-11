"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Settings2 } from "lucide-react";
import { Button } from "../ui/Button";
import { InputField } from "../ui/FormField";
import { useCloudIdentity } from "../../lib/cloud/useCloudIdentity";
import { canEditFinance } from "../../lib/cloud/permissions";
import { getSyncQueue } from "../../lib/cloud/repository";
import { queueTargetSyncState } from "../../lib/cloud/repository-core.mjs";
import { followUpRuleForm, followUpRulesError, followUpRulesSnapshot, parseFollowUpRules, resolveFollowUpSettings, type FollowUpRuleForm } from "../../lib/crmFollowUpSettings";
import type { CrmFollowUpSettings } from "../../lib/models";

type Store = { items: CrmFollowUpSettings[]; isReady: boolean; createItem: (item: CrmFollowUpSettings) => CrmFollowUpSettings; updateItem: (id: string, update: (current: CrmFollowUpSettings) => CrmFollowUpSettings) => CrmFollowUpSettings };
type Draft = { form: FollowUpRuleForm; original: CrmFollowUpSettings | null; expected: string; saved: boolean };

export function FollowUpRules({ store }: { store: Store }) {
  const identity = useCloudIdentity();
  const key = JSON.stringify([identity.mode, identity.identity?.organisationId, identity.identity?.userId, identity.identity?.role, identity.identity?.customerSourceId]);
  return <FollowUpRulesSession key={key} store={store} identity={identity} />;
}

function FollowUpRulesSession({ store, identity }: { store: Store; identity: ReturnType<typeof useCloudIdentity> }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const ready = identity.isReady && store.isReady;
  const allowed = identity.mode === "local" || canEditFinance(identity.identity?.role);
  const frame = useMemo(() => ({ draft, items: store.items, ready, allowed }), [draft, store.items, ready, allowed]);
  const latest = useRef({ store, ready: false, allowed: false, frame });
  useLayoutEffect(() => {
    latest.current = { store, ready, allowed, frame };
    return () => { latest.current = { ...latest.current, ready: false, allowed: false }; };
  }, [store, ready, allowed, frame]);
  const selected = resolveFollowUpSettings(store.items);
  const form = draft && !draft.saved ? draft.form : followUpRuleForm(selected.settings);

  function requireAccess() {
    const current = latest.current;
    if (current.frame !== frame || !current.ready || !current.allowed) throw new Error("Wait for this account's authorised follow-up rules. Changes are managed by the office.");
    const resolved = resolveFollowUpSettings(current.store.items);
    if (resolved.error) throw new Error(resolved.error);
    return resolved;
  }
  function showDraft(next: Draft | null) { draftRef.current = next; setDraft(next); }
  function newDraft(): Draft {
    const current = requireAccess();
    return { form: followUpRuleForm(current.settings), original: current.exists ? current.settings : null, expected: current.exists ? followUpRulesSnapshot(current.settings) : "", saved: false };
  }
  function edit(key: keyof FollowUpRuleForm, value: string) {
    if (draftRef.current !== draft) return;
    try {
      requireAccess();
      const active = !draft || draft.saved ? newDraft() : draft;
      showDraft({ ...active, form: { ...active.form, [key]: value } }); setError(""); setMessage("");
    } catch (error) { setError(error instanceof Error ? error.message : "Rules are unavailable."); }
  }
  function useSaved() {
    if (draftRef.current !== draft) return;
    try { requireAccess(); showDraft(null); setError(""); setMessage("Saved values loaded. Unsaved edits were discarded."); }
    catch (error) { setError(error instanceof Error ? error.message : "Rules are unavailable."); }
  }
  function save() {
    if (draftRef.current !== draft || draft?.saved) return;
    let active = draft;
    try {
      const current = requireAccess();
      active ??= newDraft();
      const values = parseFollowUpRules(active.form);
      const updatedAt = new Date().toISOString();
      if (identity.mode !== "local") {
        const sourceId = active.original?.id ?? current.settings.id;
        const state = queueTargetSyncState(getSyncQueue(), { table: "cloud_collections", sourceId, collectionKey: "jr-os-crm-follow-up-settings" }, navigator.onLine);
        if (state === "Failed" || state === "Conflict") throw new Error("Resolve the failed or conflicting rule sync before saving.");
      }
      if (active.original) {
        if (!current.exists || followUpRulesSnapshot(current.settings) !== active.expected) throw new Error("The saved rules changed. Use saved values to review them before editing again.");
        const expected = active.expected;
        latest.current.store.updateItem(active.original.id, record => {
          if (followUpRulesSnapshot(record) !== expected) throw new Error("The saved rules changed before the save. Use saved values to review them first.");
          return { ...record, ...values, updatedAt };
        });
      } else {
        if (current.exists) throw new Error("Rules have been saved since this draft started. Use saved values before editing again.");
        latest.current.store.createItem({ ...current.settings, ...values, updatedAt });
      }
      showDraft({ ...active, saved: true }); setError(""); setMessage("Follow-up rules saved on this device. The queue uses these saved values. Check sync status before switching devices.");
    } catch (error) {
      if (active) showDraft({ ...active });
      setMessage(""); setError(`Rules could not be saved. Your edits are retained. ${error instanceof Error ? error.message : "Please retry."}`);
    }
  }

  return <details className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
    <summary className="flex min-h-12 cursor-pointer items-center gap-2 font-semibold"><Settings2 className="size-4 text-cyan-300" />Follow-up rules</summary>
    {!ready ? <p className="mt-4 text-sm text-slate-400">Loading follow-up rules…</p> : selected.error ? <p role="alert" className="mt-4 text-sm text-amber-200">{selected.error}</p> : <>
      <p className="mt-3 text-sm text-slate-400">{selected.exists ? "Priorities use saved rules, including while you edit." : "Default rules apply until you save your first settings."} Day windows allow 1–3650 whole days. Leaving this page or changing account loses unsaved edits.</p>
      {followUpRulesError(selected.settings) ? <p role="alert" className="mt-3 text-sm text-amber-200">The saved values need review before this queue can be calculated. {followUpRulesError(selected.settings)}</p> : null}
      {!allowed ? <p className="mt-3 text-sm text-amber-200">Follow-up rule changes are managed by the office.</p> : null}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <InputField label="Quote ageing (days)" type="number" inputMode="numeric" min="1" max="3650" step="1" disabled={!allowed} value={form.quoteAgeDays} onChange={event => edit("quoteAgeDays", event.target.value)} />
        <InputField label="No response (days)" type="number" inputMode="numeric" min="1" max="3650" step="1" disabled={!allowed} value={form.noResponseDays} onChange={event => edit("noResponseDays", event.target.value)} />
        <InputField label="Lost opportunity window" type="number" inputMode="numeric" min="1" max="3650" step="1" disabled={!allowed} value={form.lostOpportunityDays} onChange={event => edit("lostOpportunityDays", event.target.value)} />
        <InputField label="High value threshold (£)" type="number" inputMode="decimal" min="0" step="0.01" disabled={!allowed} value={form.highValueThreshold} onChange={event => edit("highValueThreshold", event.target.value)} />
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row"><Button type="button" onClick={save} className="min-h-12" disabled={!allowed || Boolean(draft?.saved)}><RefreshCw className="mr-2 size-4" />Save and recalculate</Button><Button type="button" variant="secondary" onClick={useSaved} className="min-h-12" disabled={!allowed || !draft}>Use saved values</Button></div>
    </>}
    {error ? <p role="alert" className="mt-3 text-sm text-red-200">{error}</p> : null}
    {message ? <p role="status" className="mt-3 text-sm text-cyan-200">{message}</p> : null}
  </details>;
}
