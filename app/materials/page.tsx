"use client";

import { FormEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, History, Package, Pencil, Plus, RefreshCw, Search, Star, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { EntityEmptyState } from "../../components/crm/EntityEmptyState";
import { MaterialShareActions } from "../../components/materials/MaterialShareActions";
import { useMaterialsCollection } from "../../lib/cloud/coreBusinessCollections";
import { useCloudIdentity } from "../../lib/cloud/useCloudIdentity";
import { readSupabaseSession } from "../../lib/supabase/client";
import { captureSupabaseSessionOwnership, readSupabaseSessionOwnershipEpoch } from "../../lib/supabase/client";
import { sameSupabaseSessionOwnership, supabaseSessionUserId } from "../../lib/supabase/sessionOwnership-core.mjs";
import { savedIdentityIndex } from "../../lib/assistantIdentity";
import { getSyncQueue } from "../../lib/cloud/repository";
import { queueTargetSyncState } from "../../lib/cloud/repository-core.mjs";
import { safeMaterialProductUrl } from "../../lib/materialSharing";
import { makeId } from "../../lib/storage";
import type { Material, MaterialCategory, MaterialPriceHistory, MaterialPriceSource, MaterialUnit } from "../../lib/models";

const categories: MaterialCategory[] = ["Cable", "Protection", "Accessories", "Lighting", "Containment", "EV", "Testing", "Fire alarm", "Emergency lighting", "Other"];
const units: MaterialUnit[] = ["Each", "Metre", "Drum", "Box", "Pack"];
const suppliers = ["CEF", "Screwfix", "TLC Direct"] as const;
const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const pageLoadedAt = Date.now();
const blank = { name: "", category: "Accessories" as MaterialCategory, manufacturer: "", supplier: "", supplierUrl: "", stockCode: "", unit: "Each" as MaterialUnit, tradeCost: "", sellPrice: "", favourite: false, notes: "" };

type SupplierName = typeof suppliers[number];
type LookupResult = {
  supplier: SupplierName;
  stockCode: string;
  name?: string;
  manufacturer?: string;
  productUrl?: string;
  publicPrice?: number;
  searchUrl: string;
  exactMatch: boolean;
  message: string;
};
type MaterialDraft = { id: string; original?: Material; candidate?: Material; input?: string; busy: boolean; complete: boolean };
function materialSnapshot(value: unknown) {
  return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
}
function validAmount(value: string) { return value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= Number.MAX_SAFE_INTEGER; }

function ageInDays(date?: string) {
  if (!date) return Number.POSITIVE_INFINITY;
  return Math.floor((pageLoadedAt - new Date(date).getTime()) / 86_400_000);
}

export default function MaterialsPage() {
  const materials = useMaterialsCollection();
  const identityState = useCloudIdentity();
  const member = identityState.identity;
  const epoch = readSupabaseSessionOwnershipEpoch();
  const accountKey = JSON.stringify([member?.organisationId, member?.userId, member?.role, member?.customerSourceId]);
  const [confirmedAccount, setConfirmedAccount] = useState(accountKey);
  if (identityState.isReady && confirmedAccount !== accountKey) setConfirmedAccount(accountKey);
  // Focus refresh temporarily clears identity. Keep the draft mounted while
  // writes are disabled; confirmed account changes and session epochs reset it.
  const sessionKey = JSON.stringify([identityState.mode, epoch, identityState.isReady ? accountKey : confirmedAccount]);
  return <MaterialsSession key={sessionKey} materials={materials} identityState={identityState} />;
}

function MaterialsSession({ materials, identityState }: { materials: ReturnType<typeof useMaterialsCollection>; identityState: ReturnType<typeof useCloudIdentity> }) {
  const { identity } = identityState;
  const officeAllowed = identityState.mode === "local" || Boolean(identity && ["owner", "admin", "office"].includes(identity.role));
  const priceRestricted = !officeAllowed;
  const [form, setForm] = useState(blank);
  const [draft, setDraft] = useState<MaterialDraft | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"All" | MaterialCategory>("All");
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [quickDraft, setQuickDraft] = useState<MaterialDraft | null>(null);
  const [quickTradeCost, setQuickTradeCost] = useState("");
  const [quickMarkup, setQuickMarkup] = useState("20");
  const [lookupSupplier, setLookupSupplier] = useState<SupplierName>("CEF");
  const [lookupCode, setLookupCode] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupMessage, setLookupMessage] = useState("");
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const draftRefs = useRef<{ main: MaterialDraft | null; quick: MaterialDraft | null }>({ main: null, quick: null });

  const sharingAccountKey = JSON.stringify([identityState.mode, identity?.organisationId, identity?.userId, identity?.role, identity?.customerSourceId, readSupabaseSessionOwnershipEpoch()]);
  const sharingAccount = useMemo(() => ({ key: sharingAccountKey, ownership: captureSupabaseSessionOwnership() }), [sharingAccountKey]);
  const sharingOwnership = sharingAccount.ownership;
  const sharingRoleAllowed = identityState.mode === "local" || Boolean(identity && ["owner", "admin", "office", "electrician"].includes(identity.role));
  const sharingSessionReady = identityState.mode === "local" || Boolean(sharingOwnership.session?.access_token && !sharingOwnership.session.is_password_recovery && supabaseSessionUserId(sharingOwnership.session) === identity?.userId);
  const sharingReady = identityState.isReady && materials.isReady && sharingRoleAllowed && sharingSessionReady;
  const sharingScope = useMemo(() => ({ key: sharingAccountKey, ready: sharingReady, ownership: sharingOwnership, items: materials.items }), [sharingAccountKey, sharingReady, sharingOwnership, materials.items]);
  const materialIndex = useMemo(() => savedIdentityIndex(materials.items), [materials.items]);
  const latestSharing = useRef({ active: false, scope: sharingScope, ready: sharingReady, items: materials.items });
  useLayoutEffect(() => {
    latestSharing.current = { active: true, scope: sharingScope, ready: sharingReady, items: materials.items };
    return () => { latestSharing.current.active = false; };
  }, [sharingScope, sharingReady, materials.items]);
  const mutationReady = sharingReady && officeAllowed;
  const showForm = mutationReady && Boolean(draft);
  const editingId = draft?.original?.id;
  const quickEditId = mutationReady ? quickDraft?.id : undefined;
  const editFrame = useMemo(() => ({ sharingScope, mutationReady, form, draft, quickDraft, quickTradeCost, quickMarkup, lookupResult }), [sharingScope, mutationReady, form, draft, quickDraft, quickTradeCost, quickMarkup, lookupResult]);
  const latestEdit = useRef({ active: false, frame: editFrame, materials });
  useLayoutEffect(() => {
    const current = latestEdit.current;
    current.active = true; current.frame = editFrame; current.materials = materials;
    return () => { current.active = false; };
  });

  function canMutate() {
    const session = readSupabaseSession();
    return latestEdit.current.active && latestEdit.current.frame === editFrame && mutationReady
      && (identityState.mode === "local" || Boolean(session?.access_token && !session.is_password_recovery && supabaseSessionUserId(session) === identity?.userId
        && sameSupabaseSessionOwnership(session, readSupabaseSessionOwnershipEpoch(), sharingOwnership.session, sharingOwnership.epoch)));
  }
  function draftCurrent(current: MaterialDraft | null, kind: "main" | "quick") {
    return canMutate() && current !== null && draftRefs.current[kind] === current && !current.complete;
  }
  function requireMutation(id: string) {
    if (!canMutate()) throw new Error("The account or material view changed. Review the current material before saving.");
    if (identityState.mode !== "local") {
      const state = queueTargetSyncState(getSyncQueue(), { table: "materials", sourceId: id }, navigator.onLine);
      if (state === "Failed" || state === "Conflict") throw new Error("Resolve this material's failed or conflicting sync before changing it.");
    }
  }
  function requireRecord(expected: Material) {
    requireMutation(expected.id);
    const current = savedIdentityIndex(latestEdit.current.materials.items).unique.get(expected.id);
    if (!current || materialSnapshot(current) !== materialSnapshot(expected)) throw new Error("The material changed, is missing or has a duplicate identity. Reopen its current record before editing.");
    return current;
  }
  function validateRecord(current: Material, expected: Material) {
    requireRecord(expected);
    if (materialSnapshot(current) !== materialSnapshot(expected)) throw new Error("The material changed before the save. Reopen it to review the current values.");
  }
  function saveMaterial(active: MaterialDraft, kind: "main" | "quick", input: unknown, build: () => Material) {
    if (!draftCurrent(active, kind) || active.busy) throw new Error("Review the current material draft before saving.");
    active.busy = true;
    try {
      requireMutation(active.id);
      const matches = latestEdit.current.materials.items.filter(item => item.id === active.id);
      if (matches.length > 1) throw new Error("This material has a duplicate identity. Resolve it before saving.");
      if (matches.length === 1 && active.candidate && materialSnapshot(matches[0]) === materialSnapshot(active.candidate)) {
        active.complete = true;
        return { record: matches[0], recovered: true };
      }
      if (active.original) requireRecord(active.original);
      else if (matches.length) throw new Error("This material identity already belongs to a changed record. Review saved materials before continuing.");
      const snapshot = materialSnapshot(input);
      if (!active.candidate || active.input !== snapshot) { active.candidate = build(); active.input = snapshot; }
      const candidate = active.candidate;
      if (active.original) {
        const original = active.original;
        latestEdit.current.materials.updateItem(active.id, current => {
          if (!draftCurrent(active, kind)) throw new Error("The draft changed before saving.");
          validateRecord(current, original);
          return candidate;
        });
      } else latestEdit.current.materials.createItem(candidate);
      active.complete = true;
      return { record: candidate, recovered: false };
    } finally { active.busy = false; }
  }
  function savedMessage(name: string, recovered: boolean) {
    setError(""); setMessage(recovered ? `${name}: recovered the previously saved version. Later draft edits were not saved; reopen the material to review it.` : `${name} saved on this device. Check sync status before switching devices.`);
  }
  function showError(reason: unknown) { setMessage(""); setError(reason instanceof Error ? reason.message : "The material could not be saved. Your draft is still here."); }

  function canShareMaterial(expected: Pick<Material, "id" | "createdAt" | "name" | "supplier" | "stockCode" | "supplierUrl">) {
    const latest = latestSharing.current;
    if (!latest.active || latest.scope !== sharingScope || !latest.ready) return false;
    if (identityState.mode !== "local") {
      const session = readSupabaseSession();
      if (!session?.access_token || session.is_password_recovery || supabaseSessionUserId(session) !== identity?.userId || !sameSupabaseSessionOwnership(session, readSupabaseSessionOwnershipEpoch(), sharingScope.ownership.session, sharingScope.ownership.epoch)) return false;
    }
    // Recheck the entire collection, not the filtered cards: hidden duplicates are ambiguous.
    const current = savedIdentityIndex(latest.items).unique.get(expected.id);
    return Boolean(current && current.createdAt === expected.createdAt && current.name === expected.name && current.supplier === expected.supplier && current.stockCode === expected.stockCode && current.supplierUrl === expected.supplierUrl);
  }

  const filtered = useMemo(() => materials.items.filter((item) => {
    const matchesSearch = `${item.name} ${item.manufacturer} ${item.supplier} ${item.stockCode}`.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (category === "All" || item.category === category) && (!favouritesOnly || item.favourite);
  }), [materials.items, search, category, favouritesOnly]);

  const summary = useMemo(() => ({
    stale: materials.items.filter((item) => ageInDays(item.lastPriceCheckedAt) > 30).length,
    linked: materials.items.filter((item) => safeMaterialProductUrl(item.supplierUrl)).length,
    favourites: materials.items.filter((item) => item.favourite).length,
  }), [materials.items]);

  function reset() {
    draftRefs.current.main = null;
    setForm(blank);
    setDraft(null);
    setError("");
  }

  function openForm(values = blank, original?: Material) {
    if (!canMutate()) return;
    const next = { id: original?.id ?? makeId("mat"), original: original ? structuredClone(original) : undefined, busy: false, complete: false };
    draftRefs.current.main = next; draftRefs.current.quick = null;
    setDraft(next); setQuickDraft(null); setForm(values); setError(""); setMessage("");
  }
  function changeForm(patch: Partial<typeof blank>) {
    if (draftCurrent(draft, "main")) setForm(current => ({ ...current, ...patch }));
  }

  function startEdit(item: Material) {
    if (!canMutate()) return;
    try {
      requireRecord(item);
      openForm({ name: item.name, category: item.category, manufacturer: item.manufacturer, supplier: item.supplier, supplierUrl: item.supplierUrl, stockCode: item.stockCode, unit: item.unit, tradeCost: item.tradeCost === undefined ? "" : String(item.tradeCost), sellPrice: item.sellPrice === undefined ? "" : String(item.sellPrice), favourite: item.favourite, notes: item.notes }, item);
    } catch (error) { showError(error); }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draftCurrent(draft, "main") || !draft || draft.busy) return;
    const tradeCost = Number(form.tradeCost);
    const sellPrice = Number(form.sellPrice);
    if (!form.name.trim()) { setError("Material name is required."); return; }
    const supplierUrl = safeMaterialProductUrl(form.supplierUrl);
    if (form.supplierUrl.trim() && !supplierUrl) { setError("Supplier link must be a valid http:// or https:// product URL without credentials or control characters."); return; }
    if (!validAmount(form.tradeCost) || !validAmount(form.sellPrice)) { setError("Enter a valid non-negative trade cost and selling price. Use £0 only when intentional."); return; }
    if (!categories.includes(form.category) || !units.includes(form.unit)) { setError("Choose a valid material category and unit."); return; }
    const payload = {
      name: form.name.trim(),
      category: form.category,
      manufacturer: form.manufacturer.trim(),
      supplier: form.supplier.trim(),
      supplierUrl,
      stockCode: form.stockCode.trim(),
      unit: form.unit,
      tradeCost,
      sellPrice,
      favourite: form.favourite,
      notes: form.notes.trim(),
      priceSource: "Manual" as MaterialPriceSource,
    };
    try {
      const result = saveMaterial(draft, "main", payload, () => {
        const now = new Date().toISOString();
        const priceEntry: MaterialPriceHistory = { id: makeId("price"), tradeCost, sellPrice, source: "Manual", recordedAt: now };
        return { ...draft.original, id: draft.id, ...payload, priceHistory: [...(draft.original?.priceHistory ?? []), priceEntry].slice(-12), createdAt: draft.original?.createdAt ?? now, updatedAt: now, lastPriceCheckedAt: now };
      });
      reset(); savedMessage(result.record.name, result.recovered);
    } catch (error) { showError(error); }
  }

  async function lookupStockCode(event: FormEvent) {
    event.preventDefault();
    const stockCode = lookupCode.trim();
    if (!stockCode) { setLookupMessage("Enter a supplier stock code."); return; }
    setLookupBusy(true);
    setLookupMessage("");
    setLookupResult(null);
    try {
      const session = readSupabaseSession();
      if (!session || session.is_password_recovery) {
        throw new Error("Sign in before using supplier lookups.");
      }
      const response = await fetch("/api/materials/lookup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ supplier: lookupSupplier, stockCode }),
      });
      const result = await response.json() as LookupResult & { error?: string };
      if (!response.ok) throw new Error(result.error || "Supplier lookup failed.");
      setLookupResult(result);
      setLookupMessage(result.message);
    } catch (lookupError) {
      setLookupMessage(lookupError instanceof Error ? lookupError.message : "Supplier lookup failed.");
    } finally {
      setLookupBusy(false);
    }
  }

  function useLookupResult() {
    if (!lookupResult || !canMutate()) return;
    const suggestedPrice = priceRestricted || lookupResult.publicPrice === undefined ? "" : String(lookupResult.publicPrice.toFixed(2));
    openForm({
      ...blank,
      name: lookupResult.name || `${lookupResult.supplier} item ${lookupResult.stockCode}`,
      manufacturer: lookupResult.manufacturer || "",
      supplier: lookupResult.supplier,
      supplierUrl: safeMaterialProductUrl(lookupResult.productUrl) || safeMaterialProductUrl(lookupResult.searchUrl),
      stockCode: lookupResult.stockCode,
      tradeCost: suggestedPrice,
      sellPrice: suggestedPrice,
      notes: priceRestricted ? "Supplier product details imported for field use." : lookupResult.publicPrice === undefined ? "Confirm your trade price before saving." : "Public website price imported. Confirm your account-specific trade price before saving.",
    });
  }

  function remove(item: Material) {
    if (!canMutate()) return;
    try {
      requireRecord(item);
      if (!window.confirm(`Delete ${item.name}? This cannot be undone.`)) return;
      requireRecord(item);
      latestEdit.current.materials.removeItem(item.id, current => validateRecord(current, item));
      if (draft?.id === item.id) reset();
      if (quickDraft?.id === item.id) closeQuick();
      setError(""); setMessage(`${item.name} deleted on this device. Check sync status before switching devices.`);
    } catch (error) { showError(error); }
  }

  function toggleFavourite(item: Material) {
    if (!canMutate()) return;
    try {
      requireRecord(item);
      latestEdit.current.materials.updateItem(item.id, current => {
        validateRecord(current, item);
        return { ...current, favourite: !current.favourite, updatedAt: new Date().toISOString() };
      });
      savedMessage(item.name, false);
    } catch (error) { showError(error); }
  }

  function openQuickUpdate(item: Material) {
    if (!canMutate()) return;
    try {
      requireRecord(item);
      const markup = item.tradeCost > 0 ? ((item.sellPrice - item.tradeCost) / item.tradeCost) * 100 : 20;
      const next = { id: item.id, original: structuredClone(item), busy: false, complete: false };
      reset(); draftRefs.current.quick = next; setQuickDraft(next); setMessage("");
      setQuickTradeCost(item.tradeCost === undefined ? "" : String(item.tradeCost));
      setQuickMarkup(markup.toFixed(1));
    } catch (error) { showError(error); }
  }

  function closeQuick() { draftRefs.current.quick = null; setQuickDraft(null); }

  function saveQuickUpdate() {
    if (!draftCurrent(quickDraft, "quick") || !quickDraft?.original || quickDraft.busy) return;
    const item = quickDraft.original;
    const tradeCost = Number(quickTradeCost);
    const markup = Number(quickMarkup);
    const sellPrice = Number((tradeCost * (1 + markup / 100)).toFixed(2));
    if (!validAmount(quickTradeCost) || !validAmount(quickMarkup) || !Number.isFinite(sellPrice) || sellPrice > Number.MAX_SAFE_INTEGER) { setError("Enter a valid non-negative trade cost and markup that produce a finite selling price. Use zero only when intentional."); return; }
    try {
      const result = saveMaterial(quickDraft, "quick", { tradeCost, markup }, () => {
        const now = new Date().toISOString();
        const source: MaterialPriceSource = "Manual";
        const priceEntry: MaterialPriceHistory = { id: makeId("price"), tradeCost, sellPrice, source, recordedAt: now };
        return { ...item, tradeCost, sellPrice, lastPriceCheckedAt: now, priceSource: source, priceHistory: [...(item.priceHistory ?? []), priceEntry].slice(-12), updatedAt: now };
      });
      closeQuick(); savedMessage(result.record.name, result.recovered);
    } catch (error) { showError(error); }
  }

  const lookupProductUrl = lookupResult ? safeMaterialProductUrl(lookupResult.productUrl) || safeMaterialProductUrl(lookupResult.searchUrl) : "";

  return <div className="space-y-6">
    <PageHeader eyebrow={priceRestricted ? "Materials" : "Pricing"} title="Materials Library" description={priceRestricted ? "Browse supplier-linked materials without office pricing. Catalogue changes are managed by the office." : "Track supplier links, trade costs, selling prices and price-check dates for faster, safer quoting."} action={<Button disabled={!mutationReady} onClick={() => { if (!canMutate()) return; if (showForm) reset(); else openForm(); }}><Plus className="mr-2 size-4" />{showForm ? "Close form" : "Add material"}</Button>} />
    {!mutationReady ? <p className="text-sm text-amber-200">Load your materials and sign in with an office account to add items or change saved prices.</p> : null}
    {error ? <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/5 p-4 text-sm text-red-200">{error}</p> : null}
    {message ? <p role="status" className="rounded-xl border border-cyan-400/30 bg-cyan-400/5 p-4 text-sm text-cyan-200">{message}</p> : null}

    <div className="rounded-xl border border-cyan-400/30 bg-cyan-400/5 p-4"><Link href="/starter-library" className="inline-flex min-h-12 items-center font-semibold text-cyan-200">Browse starter materials</Link><p className="text-sm text-slate-400">Review the starter catalogue and choose what to import. Browsing here does not add any records.</p></div>

    <section className={`grid gap-4 sm:grid-cols-2 ${priceRestricted ? "" : "xl:grid-cols-3"}`}>
      <Card><p className="text-sm text-slate-400">Supplier-linked items</p><p className="mt-2 text-3xl font-bold">{summary.linked}</p></Card>
      {!priceRestricted ? <Card><p className="text-sm text-slate-400">Prices over 30 days old</p><p className={`mt-2 text-3xl font-bold ${summary.stale ? "text-amber-300" : "text-emerald-300"}`}>{summary.stale}</p></Card> : null}
      <Card><p className="text-sm text-slate-400">Favourite materials</p><p className="mt-2 text-3xl font-bold">{summary.favourites}</p></Card>
    </section>

    <Card className="border-cyan-400/30">
      <div className="flex items-start gap-3"><Search className="mt-0.5 size-5 text-cyan-300" /><div><h2 className="font-semibold">Find material by supplier stock code</h2><p className="mt-1 text-sm text-slate-400">Search CEF, Screwfix or TLC Direct. JR OS will import machine-readable product details when available and otherwise open the supplier result for confirmation.</p></div></div>
      <form onSubmit={lookupStockCode} className="mt-5 grid gap-3 md:grid-cols-[200px_1fr_auto]">
        <select value={lookupSupplier} onChange={(event) => setLookupSupplier(event.target.value as SupplierName)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{suppliers.map((supplier) => <option key={supplier}>{supplier}</option>)}</select>
        <input aria-label="Supplier stock code lookup" value={lookupCode} onChange={(event) => setLookupCode(event.target.value)} placeholder="Enter or paste stock code or product code" maxLength={128} autoCapitalize="none" spellCheck={false} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 outline-none focus:border-cyan-400" />
        <Button type="submit" disabled={lookupBusy}>{lookupBusy ? "Searching…" : "Find product"}</Button>
      </form>
      {lookupMessage ? <p className="mt-4 rounded-xl bg-slate-950 p-3 text-sm text-slate-300">{lookupMessage}</p> : null}
      {lookupResult ? <div className="mt-4 flex flex-wrap gap-3"><Button disabled={!mutationReady} onClick={useLookupResult}><Plus className="mr-2 size-4" />Add to materials</Button>{lookupProductUrl ? <a href={lookupProductUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold"><ExternalLink className="size-4" />Open supplier result</a> : null}</div> : null}
    </Card>

    {showForm ? <Card><form onSubmit={submit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <InputField required label="Material name" value={form.name} onChange={(e) => changeForm({ name: e.target.value })} />
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Category</span><select value={form.category} onChange={(e) => changeForm({ category: e.target.value as MaterialCategory })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
      <InputField label="Manufacturer" value={form.manufacturer} onChange={(e) => changeForm({ manufacturer: e.target.value })} />
      <InputField label="Supplier" value={form.supplier} onChange={(e) => changeForm({ supplier: e.target.value })} />
      <InputField label="Supplier link" type="url" value={form.supplierUrl} onChange={(e) => changeForm({ supplierUrl: e.target.value })} placeholder="Paste a supplier product link" maxLength={2048} autoCapitalize="none" spellCheck={false} />
      <InputField label="Stock code" value={form.stockCode} onChange={(e) => changeForm({ stockCode: e.target.value })} placeholder="Paste a supplier stock code" maxLength={128} autoCapitalize="none" spellCheck={false} />
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Unit</span><select value={form.unit} onChange={(e) => changeForm({ unit: e.target.value as MaterialUnit })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{units.map((item) => <option key={item}>{item}</option>)}</select></label>
      {!priceRestricted ? <InputField required label="Trade cost (£)" type="number" inputMode="decimal" min="0" step="any" value={form.tradeCost} onChange={(e) => changeForm({ tradeCost: e.target.value })} /> : null}
      {!priceRestricted ? <InputField required label="Selling price (£)" type="number" inputMode="decimal" min="0" step="any" value={form.sellPrice} onChange={(e) => changeForm({ sellPrice: e.target.value })} /> : null}
      <label className="flex items-center gap-3 pt-8 text-sm text-slate-300"><input type="checkbox" checked={form.favourite} onChange={(e) => changeForm({ favourite: e.target.checked })} />Favourite material</label>
      <div className="md:col-span-2 xl:col-span-4"><TextareaField label="Notes" value={form.notes} onChange={(e) => changeForm({ notes: e.target.value })} /></div>
      <p className="text-xs text-slate-400 md:col-span-2 xl:col-span-4">Enter buying and selling allowances before saving. Use £0 only when intentional. Failed saves keep this form available to retry; leaving the page loses unsaved edits.</p>
      <div className="flex justify-end md:col-span-2 xl:col-span-4"><Button type="submit">{editingId ? "Update material" : "Save material"}</Button></div>
    </form></Card> : null}

    <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
      <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search materials, supplier or stock code" className="min-h-11 w-full rounded-xl border border-slate-800 bg-slate-900 pl-10 pr-4 text-sm outline-none focus:border-cyan-400" /></div>
      <select value={category} onChange={(e) => setCategory(e.target.value as "All" | MaterialCategory)} className="min-h-11 rounded-xl border border-slate-800 bg-slate-900 px-4 text-sm"><option>All</option>{categories.map((item) => <option key={item}>{item}</option>)}</select>
      <Button variant={favouritesOnly ? "primary" : "secondary"} onClick={() => setFavouritesOnly((value) => !value)}><Star className="mr-2 size-4" />Favourites</Button>
    </div>

    {!materials.isReady ? <Card>Loading materials…</Card> : filtered.length === 0 ? <EntityEmptyState icon={<Package className="size-6" />} title={materials.items.length ? "No matching materials" : "No materials yet"} description={materials.items.length ? "Change the search or filters." : "Search a supplier stock code or add a commonly used product."} /> : <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((item) => {
      const tradeCost = item.tradeCost ?? 0;
      const sellPrice = item.sellPrice ?? 0;
      const markup = tradeCost > 0 ? ((sellPrice - tradeCost) / tradeCost) * 100 : 0;
      const daysOld = ageInDays(item.lastPriceCheckedAt);
      const stale = daysOld > 30;
      const lastHistory = priceRestricted ? [] : (item.priceHistory ?? []).slice(-3).reverse();
      const supplierUrl = safeMaterialProductUrl(item.supplierUrl);
      const shareMaterial = { name: item.name, supplier: item.supplier, stockCode: item.stockCode, supplierUrl: item.supplierUrl };
      const expectedShareMaterial = { id: item.id, createdAt: item.createdAt, ...shareMaterial };
      return <Card key={item.id}>
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{item.category} · {item.unit}</p><h2 className="mt-1 text-lg font-bold">{item.name}</h2><p className="text-sm text-slate-500">{item.manufacturer || item.supplier || "No manufacturer or supplier"}</p></div><div className="flex"><button disabled={!mutationReady || !materialIndex.unique.has(item.id)} onClick={() => toggleFavourite(item)} aria-label={`Favourite ${item.name}`} className={`min-h-11 min-w-11 rounded-lg p-2 ${item.favourite ? "text-amber-300" : "text-slate-500 hover:text-amber-300"}`}><Star className="size-4" fill={item.favourite ? "currentColor" : "none"} /></button><button disabled={!mutationReady || !materialIndex.unique.has(item.id)} onClick={() => startEdit(item)} aria-label={`Edit ${item.name}`} className="min-h-11 min-w-11 rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-cyan-300"><Pencil className="size-4" /></button>{!priceRestricted ? <button disabled={!mutationReady || !materialIndex.unique.has(item.id)} onClick={() => remove(item)} aria-label={`Delete ${item.name}`} className="min-h-11 min-w-11 rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-4" /></button> : null}</div></div>
        {!priceRestricted ? <>
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-800 pt-4 text-sm"><div><p className="text-slate-500">Trade cost</p><p className="font-semibold">{money.format(tradeCost)}</p></div><div><p className="text-slate-500">Selling price</p><p className="font-semibold">{money.format(sellPrice)}</p></div><div><p className="text-slate-500">Markup</p><p className="font-semibold">{markup.toFixed(1)}%</p></div><div><p className="text-slate-500">Stock code</p><p className="font-semibold">{item.stockCode || "—"}</p></div></div>
          <div className={`mt-4 rounded-xl border p-3 text-xs ${stale ? "border-amber-500/30 bg-amber-500/5 text-amber-200" : "border-emerald-500/30 bg-emerald-500/5 text-emerald-200"}`}>{item.lastPriceCheckedAt ? `Price checked ${daysOld} day${daysOld === 1 ? "" : "s"} ago` : "Price has not been checked yet"}</div>
          {quickEditId === item.id ? <div className="mt-4 grid gap-3 rounded-xl border border-cyan-400/30 bg-slate-950 p-4"><InputField label="New trade cost (£)" type="number" inputMode="decimal" min="0" step="any" value={quickTradeCost} onChange={(e) => { if (draftCurrent(quickDraft, "quick")) setQuickTradeCost(e.target.value); }} /><InputField label="Markup (%)" type="number" inputMode="decimal" min="0" step="any" value={quickMarkup} onChange={(e) => { if (draftCurrent(quickDraft, "quick")) setQuickMarkup(e.target.value); }} /><div className="flex gap-2"><Button onClick={saveQuickUpdate}>Save price</Button><Button variant="secondary" onClick={() => { if (draftCurrent(quickDraft, "quick")) closeQuick(); }}>Cancel</Button></div></div> : <div className="mt-4 flex flex-wrap gap-2"><Button disabled={!mutationReady || !materialIndex.unique.has(item.id)} variant="secondary" onClick={() => openQuickUpdate(item)}><RefreshCw className="mr-2 size-4" />Quick update</Button>{supplierUrl ? <a href={supplierUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-100 hover:bg-slate-800"><ExternalLink className="size-4" />Supplier</a> : null}</div>}
          {lastHistory.length ? <details className="mt-4"><summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-400"><History className="size-4" />Recent price history</summary><div className="mt-2 space-y-2">{lastHistory.map((entry) => <div key={entry.id} className="flex justify-between rounded-lg bg-slate-950 p-2 text-xs text-slate-400"><span>{new Date(entry.recordedAt).toLocaleDateString("en-GB")}</span><span>{money.format(entry.tradeCost)} → {money.format(entry.sellPrice)}</span></div>)}</div></details> : null}
        </> : <>
          <div className="mt-5 border-t border-slate-800 pt-4 text-sm"><p className="text-slate-500">Stock code</p><p className="font-semibold">{item.stockCode || "—"}</p></div>
          {supplierUrl ? <div className="mt-4"><a href={supplierUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-100 hover:bg-slate-800"><ExternalLink className="size-4" />Supplier</a></div> : null}
        </>}
        <div className="mt-4 border-t border-slate-800 pt-4"><MaterialShareActions material={shareMaterial} enabled={sharingReady && materialIndex.unique.has(item.id)} contextKey={JSON.stringify([sharingAccountKey, item.id])} canUse={() => canShareMaterial(expectedShareMaterial)} /></div>
      </Card>;
    })}</section>}
  </div>;
}
