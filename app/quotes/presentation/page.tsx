"use client";

import { CheckCircle2, Eye, LayoutList, ReceiptText, Save } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { PageHeader } from "../../../components/ui/PageHeader";
import {
  defaultQuotePresentationSettings,
  quotePresentationPresets,
  quotePresentationSummary,
  type QuotePresentationSettings,
} from "../../../lib/quotePresentation";
import { useQuotePresentationDefaults } from "../../../lib/useQuotePresentationDefaults";
import { useState } from "react";

const sectionOptions: Array<{ key: keyof QuotePresentationSettings; label: string }> = [
  { key: "showLabour", label: "Labour" },
  { key: "showMaterials", label: "Materials" },
  { key: "showTravel", label: "Travel" },
  { key: "showParking", label: "Parking" },
  { key: "showPlantHire", label: "Plant hire" },
  { key: "showContingency", label: "Contingency" },
  { key: "showOther", label: "Other charges" },
];

const detailOptions: Array<{ key: keyof QuotePresentationSettings; label: string }> = [
  { key: "showQuantities", label: "Quantities" },
  { key: "showUnitPrices", label: "Unit prices" },
  { key: "showSubtotal", label: "Subtotal" },
  { key: "showVatLine", label: "VAT line" },
];

export default function QuotePresentationPage() {
  const defaults = useQuotePresentationDefaults();
  const [draft, setDraft] = useState<QuotePresentationSettings>(defaults.settings ?? defaultQuotePresentationSettings);
  const [saved, setSaved] = useState(false);

  function update<K extends keyof QuotePresentationSettings>(key: K, value: QuotePresentationSettings[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  function applyPreset(settings: QuotePresentationSettings) {
    setDraft({ ...settings });
    setSaved(false);
  }

  function save() {
    defaults.save(draft);
    setSaved(true);
  }

  return <div className="space-y-6">
    <PageHeader
      eyebrow="Quote Engine 3.0"
      title="Customer quote presentation"
      description="Choose what customers see without changing your internal costs, markups, margins or profitability calculations."
    />

    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <button type="button" onClick={() => applyPreset(quotePresentationPresets.fixedPrice)} className="text-left"><Card className={draft.mode === "Fixed price" ? "border-cyan-400/60" : ""}><ReceiptText className="size-5 text-cyan-300" /><h2 className="mt-3 font-bold">Fixed price</h2><p className="mt-2 text-sm text-slate-400">One total. No labour or material breakdown.</p></Card></button>
      <button type="button" onClick={() => applyPreset(quotePresentationPresets.labourOnly)} className="text-left"><Card><LayoutList className="size-5 text-violet-300" /><h2 className="mt-3 font-bold">Labour only</h2><p className="mt-2 text-sm text-slate-400">Useful for call-outs and initial fault finding.</p></Card></button>
      <button type="button" onClick={() => applyPreset(quotePresentationPresets.materialsAndLabour)} className="text-left"><Card><Eye className="size-5 text-emerald-300" /><h2 className="mt-3 font-bold">Labour and materials</h2><p className="mt-2 text-sm text-slate-400">Show the main sections when a breakdown is requested.</p></Card></button>
      <button type="button" onClick={() => applyPreset(quotePresentationPresets.fullBreakdown)} className="text-left"><Card><LayoutList className="size-5 text-amber-300" /><h2 className="mt-3 font-bold">Full breakdown</h2><p className="mt-2 text-sm text-slate-400">Show every section, quantity and unit price.</p></Card></button>
    </section>

    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Default customer view</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">New and existing quote previews use this setting unless a later per-quote override is selected.</p>
        </div>
        <label className="grid gap-2 text-sm font-medium text-slate-300">
          <span>Presentation mode</span>
          <select value={draft.mode} onChange={(event) => update("mode", event.target.value as QuotePresentationSettings["mode"])} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">
            <option>Fixed price</option>
            <option>Itemised</option>
          </select>
        </label>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="font-semibold">Sections shown to customers</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">{sectionOptions.map((option) => <label key={option.key} className={`flex min-h-12 items-center gap-3 rounded-xl border px-4 text-sm ${draft.mode === "Fixed price" ? "border-slate-800 bg-slate-950/40 text-slate-600" : "border-slate-700 bg-slate-950 text-slate-200"}`}><input type="checkbox" disabled={draft.mode === "Fixed price"} checked={Boolean(draft[option.key])} onChange={(event) => update(option.key, event.target.checked)} />{option.label}</label>)}</div>
        </div>
        <div>
          <h3 className="font-semibold">Price detail</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">{detailOptions.map((option) => <label key={option.key} className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-700 bg-slate-950 px-4 text-sm text-slate-200"><input type="checkbox" checked={Boolean(draft[option.key])} onChange={(event) => update(option.key, event.target.checked)} />{option.label}</label>)}</div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
        <p className="text-sm font-semibold text-cyan-200">Customer view summary</p>
        <p className="mt-2 text-sm text-slate-300">{quotePresentationSummary(draft)}</p>
        <p className="mt-2 text-xs text-slate-500">Internal unit costs, markups and expected profit remain visible only inside JR OS.</p>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
        {saved ? <span className="flex items-center gap-2 text-sm font-semibold text-emerald-300"><CheckCircle2 className="size-4" />Saved to cloud/local settings</span> : null}
        <Button type="button" onClick={save}><Save className="mr-2 size-4" />Save presentation defaults</Button>
      </div>
    </Card>
  </div>;
}
