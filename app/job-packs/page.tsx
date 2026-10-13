"use client";

import { FormEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BriefcaseBusiness, Plus, Search, Star } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { EntityEmptyState } from "../../components/crm/EntityEmptyState";
import { useJobPacksCollection, useMaterialsCollection } from "../../lib/cloud/coreBusinessCollections";
import { makeId } from "../../lib/storage";
import { StarterCatalogue } from "../../components/catalogue/StarterCatalogue";
import { JobPackBreakdown } from "../../components/jobs/JobPackBreakdown";
import { useCloudIdentity } from "../../lib/cloud/useCloudIdentity";
import { captureSupabaseSessionOwnership, readSupabaseSession, readSupabaseSessionOwnershipEpoch } from "../../lib/supabase/client";
import { sameSupabaseSessionOwnership, supabaseSessionUserId } from "../../lib/supabase/sessionOwnership-core.mjs";
import { savedIdentityIndex } from "../../lib/assistantIdentity";
import { jobPackTotals } from "../../lib/jobPackCatalogue";
import type { JobPack, JobPackMaterial, Material } from "../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const categories = ["Consumer unit", "Rewire", "EICR", "Fault finding", "EV charger", "Domestic small works", "Commercial small works", "Dedicated supplies", "Ventilation", "Kitchen", "Earthing and bonding", "Containment", "Lighting", "Emergency lighting", "Fire alarm", "Custom"];
const blankForm = { name: "", category: "Custom", description: "", labourDescription: "Electrician labour", labourHours: "8", labourRate: "50", testingRequirements: "", certificatesRequired: "", notes: "", internalNotes: "" };
const blankMaterial = { materialId: "", description: "", quantity: "1", unitPrice: "", unitCost: "" };

export default function JobPacksPage() {
  const packs = useJobPacksCollection();
  const materialsLibrary = useMaterialsCollection();
  const identityState = useCloudIdentity(), member = identityState.identity, local = identityState.mode === "local";
  const ownership = captureSupabaseSessionOwnership();
  const enabled = identityState.isReady && packs.isReady && materialsLibrary.isReady && (local || Boolean(member && ["owner", "admin", "office"].includes(member.role)));
  const accountKey = String(JSON.stringify([identityState.mode, member?.organisationId, member?.userId, member?.role, member?.customerSourceId, ownership.epoch]));
  const scope = useMemo(() => ({ accountKey, enabled }), [accountKey, enabled]);
  const [draft, setDraft] = useState<{ ownerKey: string; original?: JobPack } | null>(null);
  const showForm = enabled && draft?.ownerKey === accountKey;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(8);
  const [error, setError] = useState("");
  const [form, setForm] = useState(blankForm);
  const [materials, setMaterials] = useState<JobPackMaterial[]>([]);
  const [materialLine, setMaterialLine] = useState(blankMaterial);
  const latest = useRef({ active: false, scope, packs, materialsLibrary, draft });
  const consumed = useRef<object | null>(null);
  useLayoutEffect(() => { latest.current = { active: true, scope, packs, materialsLibrary, draft }; return () => { latest.current.active = false; }; });
  const active = () => latest.current.active && latest.current.scope === scope && enabled
    && (local || Boolean(ownership.session?.access_token && !ownership.session.is_password_recovery && supabaseSessionUserId(ownership.session) === member?.userId
      && sameSupabaseSessionOwnership(readSupabaseSession(), readSupabaseSessionOwnershipEpoch(), ownership.session, ownership.epoch)));
  const draftActive = () => active() && showForm && latest.current.draft === draft && consumed.current !== draft;
  const packIndex = savedIdentityIndex(packs.items), materialIndex = savedIdentityIndex(materialsLibrary.items);
  const savedPacks = enabled ? packIndex.selectable : [];
  const savedCategories = [...new Set(savedPacks.map(pack => pack.category.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const searchWords = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = savedPacks.filter(pack => {
    if (categoryFilter && pack.category.trim() !== categoryFilter) return false;
    const content = `${pack.name} ${pack.category} ${pack.description} ${pack.materials.map(line => line.description).join(" ")}`.toLowerCase();
    return searchWords.every(word => content.includes(word));
  });
  const visiblePacks = filtered.slice(0, visibleLimit);
  const labourTotal = Number(form.labourHours || 0) * Number(form.labourRate || 0);
  const materialsTotal = materials.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  function reset() {
    setForm(blankForm);
    setMaterials([]);
    setMaterialLine(blankMaterial);
    setEditingId(null);
    setDraft(null);
    setError("");
  }

  function selectLibraryMaterial(materialId: string) {
    if (!draftActive()) return;
    const selected = materialIndex.unique.get(materialId);
    setMaterialLine({ materialId: selected?.id || "", description: selected?.name ?? "", quantity: "1", unitPrice: selected ? String(selected.sellPrice) : "", unitCost: selected ? String(selected.tradeCost) : "" });
  }

  function addMaterial() {
    if (!draftActive()) return;
    const quantity = Number(materialLine.quantity);
    const unitPrice = Number(materialLine.unitPrice);
    const unitCost = materialLine.unitCost.trim() ? Number(materialLine.unitCost) : undefined;
    if (!materialLine.description.trim() || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0 || (unitCost !== undefined && (!Number.isFinite(unitCost) || unitCost < 0))) {
      setError("Add a material description, positive quantity and valid selling price.");
      return;
    }
    setMaterials((current) => [...current, { id: makeId("jpm"), materialId: materialLine.materialId || undefined, description: materialLine.description.trim(), quantity, unitPrice, unitCost }]);
    setMaterialLine(blankMaterial);
    setError("");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draftActive()) return;
    const labourHours = Number(form.labourHours);
    const labourRate = Number(form.labourRate);
    if (!form.name.trim()) { setError("Job pack name is required."); return; }
    if (!Number.isFinite(labourHours) || labourHours < 0 || !Number.isFinite(labourRate) || labourRate < 0) { setError("Labour hours and rate must be valid positive amounts."); return; }
    const now = new Date().toISOString();
    const payload = { name: form.name.trim(), category: form.category, description: form.description, labourDescription: form.labourDescription.trim() || "Electrician labour", labourHours, labourRate, materials, testingRequirements: form.testingRequirements, certificatesRequired: form.certificatesRequired, notes: form.notes, internalNotes: form.internalNotes };
    if (jobPackTotals(payload, materialsLibrary.items).total === null || savedIdentityIndex(materials).unusableCount || materials.some(line => !line.description.trim() || (line.unitCost !== undefined && (!Number.isFinite(line.unitCost) || line.unitCost < 0)))) { setError("Check each material description, positive quantity and non-negative buying/selling amounts."); return; }
    try {
      if (editingId) {
        if (!savedIdentityIndex(latest.current.packs.items).unique.has(editingId)) throw new Error("The job pack changed or is ambiguous. Reload it before saving.");
        packs.updateItem(editingId, current => {
          if (!draftActive() || JSON.stringify(current) !== JSON.stringify(draft?.original)) throw new Error("The job pack changed while you were editing. Reopen it before saving.");
          return { ...current, ...payload, updatedAt: now };
        });
      } else packs.createItem({ id: makeId("pack"), ...payload, createdAt: now, updatedAt: now });
      consumed.current = draft; reset();
    } catch (error) { setError(error instanceof Error ? error.message : "The pack could not be saved. Your draft is unchanged."); }
  }

  function edit(pack: JobPack) {
    if (!active() || savedIdentityIndex(latest.current.packs.items).unique.get(pack.id) !== pack) return;
    setForm({ name: pack.name, category: pack.category, description: pack.description, labourDescription: pack.labourDescription, labourHours: String(pack.labourHours), labourRate: String(pack.labourRate), testingRequirements: pack.testingRequirements, certificatesRequired: pack.certificatesRequired, notes: pack.notes, internalNotes: pack.internalNotes || "" });
    setMaterials(structuredClone(pack.materials));
    setEditingId(pack.id);
    setDraft({ ownerKey: accountKey, original: structuredClone(pack) });
    setError("");
  }

  function remove(pack: JobPack) {
    if (!active() || savedIdentityIndex(latest.current.packs.items).unique.get(pack.id) !== pack || !window.confirm(`Delete ${pack.name}? This cannot be undone.`) || !active()) return;
    try { packs.removeItem(pack.id, current => { if (!active() || JSON.stringify(current) !== JSON.stringify(pack)) throw new Error("The job pack changed. Review it before deleting."); }); }
    catch (error) { setError(error instanceof Error ? error.message : "The pack could not be deleted."); }
  }

  function canUseMaterial(material: Material) {
    if (!active() || !latest.current.materialsLibrary.isReady) return false;
    const current = savedIdentityIndex(latest.current.materialsLibrary.items).unique.get(material.id);
    return Boolean(current && ["name", "supplier", "stockCode", "supplierUrl"].every(key => current[key as keyof Material] === material[key as keyof Material]));
  }

  function updateLine(id: string, patch: Partial<JobPackMaterial>) { if (draftActive()) setMaterials(current => current.map(line => line.id === id ? { ...line, ...patch } : line)); }

  return <div className="space-y-6">
    <PageHeader eyebrow="Templates" title="Job Packs" description="Reusable electrical scopes with material quantities, buying allowances and fixed-price estimates. Review every pack for the actual job." action={<Button disabled={!enabled} onClick={() => { if (!active()) return; if (showForm) reset(); else { reset(); setDraft({ ownerKey: accountKey }); } }}><Plus className="mr-2 size-4" />{showForm ? "Close builder" : "New job pack"}</Button>} />
    <StarterCatalogue materials={materialsLibrary} packs={packs} identityState={identityState} />
    {!showForm && error ? <p role="alert" className="text-sm text-amber-200">{error}</p> : null}

    {showForm ? <Card><form onSubmit={submit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <InputField required label="Job pack name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Category</span><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
        <InputField label="Labour hours" type="number" min="0" step="any" value={form.labourHours} onChange={(e) => setForm({ ...form, labourHours: e.target.value })} />
        <InputField label="Charge rate (£/hour)" type="number" min="0" step="any" value={form.labourRate} onChange={(e) => setForm({ ...form, labourRate: e.target.value })} />
      </div>
      <div className="grid gap-4 md:grid-cols-2"><TextareaField label="Scope description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /><TextareaField label="Labour description" value={form.labourDescription} onChange={(e) => setForm({ ...form, labourDescription: e.target.value })} /></div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
        <h2 className="font-semibold">Pack materials</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Library material</span><select value={materialLine.materialId} onChange={(e) => selectLibraryMaterial(e.target.value)} className="min-h-12 min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">Custom item</option>{materialIndex.selectable.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <InputField label="Description" value={materialLine.description} onChange={(e) => setMaterialLine({ ...materialLine, description: e.target.value })} />
          <InputField label="Qty" type="number" min="0.01" step="any" value={materialLine.quantity} onChange={(e) => setMaterialLine({ ...materialLine, quantity: e.target.value })} />
          <InputField label="Sell price (£)" type="number" min="0" step="any" value={materialLine.unitPrice} onChange={(e) => setMaterialLine({ ...materialLine, unitPrice: e.target.value })} />
          <InputField label="Buying cost each (£)" type="number" min="0" step="any" value={materialLine.unitCost} onChange={(e) => setMaterialLine({ ...materialLine, unitCost: e.target.value })} />
          <Button type="button" className="self-end" onClick={addMaterial}>Add</Button>
        </div>
        <div className="mt-4 space-y-3">{materials.map(item => <div key={item.id} className="min-w-0 space-y-3 rounded-xl bg-slate-900 p-3 text-sm">
          <p className="break-words font-semibold">{item.description}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <InputField label={`Quantity · ${item.description}`} type="number" min="0.01" step="any" value={item.quantity} onChange={event => updateLine(item.id, { quantity: Number(event.target.value) })} />
            <InputField label={`Buying cost each (£) · ${item.description}`} type="number" min="0" step="any" value={item.unitCost ?? ""} onChange={event => updateLine(item.id, { unitCost: event.target.value.trim() ? Number(event.target.value) : undefined })} />
            <InputField label={`Selling price each (£) · ${item.description}`} type="number" min="0" step="any" value={item.unitPrice} onChange={event => updateLine(item.id, { unitPrice: Number(event.target.value) })} />
          </div><Button type="button" variant="secondary" onClick={() => { if (draftActive()) setMaterials(current => current.filter(line => line.id !== item.id)); }}>Remove material line</Button>
        </div>)}</div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3"><TextareaField label="Testing requirements" value={form.testingRequirements} onChange={(e) => setForm({ ...form, testingRequirements: e.target.value })} /><TextareaField label="Certificates required" value={form.certificatesRequired} onChange={(e) => setForm({ ...form, certificatesRequired: e.target.value })} /><TextareaField label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      <p className="text-xs text-amber-200">Scope, testing, certification and Notes are copied into the quote. Keep internal prices and history in the separate field below.</p>
      <TextareaField label="Internal pricing notes" value={form.internalNotes} onChange={event => setForm({ ...form, internalNotes: event.target.value })} />
      <div className="flex flex-col gap-3 border-t border-slate-800 pt-5 md:flex-row md:items-end md:justify-between"><div>{error ? <p className="text-sm text-red-300">{error}</p> : null}</div><div className="text-right"><p className="text-sm text-slate-400">Labour {money.format(labourTotal)}</p><p className="text-sm text-slate-400">Materials {money.format(materialsTotal)}</p><p className="text-xl font-bold">Pack total {money.format(labourTotal + materialsTotal)}</p><Button type="submit" className="mt-3">{editingId ? "Update job pack" : "Save job pack"}</Button></div></div>
    </form></Card> : null}

    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid min-w-0 gap-2 text-sm font-medium text-slate-300"><span>Search saved job packs</span><div className="relative"><Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /><input aria-label="Search saved job packs" value={search} disabled={!enabled} onChange={(e) => { if (!active()) return; setSearch(e.target.value); setVisibleLimit(8); }} placeholder="Search job packs" className="min-h-12 w-full rounded-xl border border-slate-800 bg-slate-900 pl-10 pr-4 text-sm outline-none focus:border-cyan-400 disabled:opacity-50" /></div></label>
      <label className="grid min-w-0 gap-2 text-sm font-medium text-slate-300"><span>Saved pack category</span><select aria-label="Filter job packs by category" value={categoryFilter} disabled={!enabled} onChange={(e) => { if (!active()) return; setCategoryFilter(e.target.value); setVisibleLimit(8); }} className="min-h-12 min-w-0 rounded-xl border border-slate-800 bg-slate-900 px-3 text-sm outline-none focus:border-cyan-400 disabled:opacity-50"><option value="">All categories</option>{savedCategories.map(category => <option key={category} value={category}>{category}</option>)}</select></label>
    </div>

    {!enabled ? <Card>Load your job packs and sign in with an office account to view or edit saved prices.</Card> : <>
      {packIndex.unusableCount ? <p role="alert" className="text-sm text-amber-200">Some packs have missing or duplicate IDs and are withheld. Resolve them before editing.</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-sm text-slate-400">Showing {visiblePacks.length} of {filtered.length} matching job packs · {savedPacks.length} saved</p>{search || categoryFilter ? <Button variant="secondary" onClick={() => { if (!active()) return; setSearch(""); setCategoryFilter(""); setVisibleLimit(8); }}>Clear filters</Button> : null}</div>
      {filtered.length === 0 ? <EntityEmptyState icon={<BriefcaseBusiness className="size-6" />} title={packs.items.length ? "No matching job packs" : "No job packs yet"} description={search || categoryFilter ? "Try fewer search words or clear the filters to see saved packs." : "Browse the starter catalogue above or create your own job pack."} /> : <section className="grid gap-4 lg:grid-cols-2">{visiblePacks.map(pack => <Card key={pack.id}>
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{pack.category}</p><h2 className="mt-1 text-lg font-bold">{pack.name}</h2></div><Star className="size-4 text-amber-300" /></div>
        <p className="mt-3 text-sm leading-6 text-slate-400">{pack.description}</p>
        <JobPackBreakdown pack={pack} materials={materialsLibrary.items} contextKey={accountKey} canUseMaterial={canUseMaterial} />
        <div className="mt-4 flex gap-2 border-t border-slate-800 pt-4"><Button variant="secondary" onClick={() => edit(pack)}>Edit</Button><Button variant="danger" onClick={() => remove(pack)}>Delete</Button></div>
      </Card>)}</section>}
      {visiblePacks.length < filtered.length ? <Button variant="secondary" className="w-full sm:w-auto" onClick={() => { if (active()) setVisibleLimit(current => current + 8); }}>Show more</Button> : null}
    </>}
  </div>;
}
