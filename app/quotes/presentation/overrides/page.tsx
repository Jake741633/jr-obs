"use client";

import Link from "next/link";
import { CheckCircle2, Eye, RotateCcw, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { usePricingDocumentsCollection } from "../../../../lib/cloud/coreBusinessCollections";
import {
  defaultQuotePresentationSettings,
  presentationOverrideFor,
  quotePresentationOverridesStorageKey,
  quotePresentationPresets,
  quotePresentationSummary,
  type QuotePresentationOverrideRecord,
  type QuotePresentationSettings,
} from "../../../../lib/quotePresentation";
import { useQuotePresentationDefaults } from "../../../../lib/useQuotePresentationDefaults";
import { useCloudLocalCollection } from "../../../../lib/storage";

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

export default function QuotePresentationOverridesPage() {
  const documents = usePricingDocumentsCollection();
  const defaults = useQuotePresentationDefaults();
  const overrides = useCloudLocalCollection<QuotePresentationOverrideRecord>(quotePresentationOverridesStorageKey);
  const [documentNumber, setDocumentNumber] = useState("");
  const [draft, setDraft] = useState<QuotePresentationSettings>(defaults.settings ?? defaultQuotePresentationSettings);
  const [saved, setSaved] = useState(false);

  const selectedDocument = useMemo(
    () => documents.items.find((document) => document.number === documentNumber),
    [documentNumber, documents.items],
  );
  const selectedOverride = presentationOverrideFor(overrides.items, documentNumber);

  function selectDocument(nextNumber: string) {
    setDocumentNumber(nextNumber);
    const existing = presentationOverrideFor(overrides.items, nextNumber);
    setDraft(existing ?? defaults.settings ?? defaultQuotePresentationSettings);
    setSaved(false);
  }

  function update<K extends keyof QuotePresentationSettings>(key: K, value: QuotePresentationSettings[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  function save() {
    if (!selectedDocument) return;
    const record: QuotePresentationOverrideRecord = {
      id: `quote-presentation-${selectedDocument.id}`,
      documentNumber: selectedDocument.number,
      ...draft,
      updatedAt: new Date().toISOString(),
    };
    overrides.setItems((current) => [record, ...current.filter((item) => item.documentNumber !== record.documentNumber)]);
    setSaved(true);
  }

  function removeOverride() {
    if (!selectedDocument) return;
    overrides.remove((item) => item.documentNumber === selectedDocument.number);
    setDraft(defaults.settings ?? defaultQuotePresentationSettings);
    setSaved(false);
  }

  return <div className="space-y-6">
    <PageHeader
      eyebrow="Quote Engine 3.0"
      title="Per-quote customer view"
      description="Keep fixed price as your normal default, then give an individual customer a breakdown only when needed."
      action={<Link href="/quotes/presentation"><Button variant="secondary">Default settings</Button></Link>}
    />

    <Card>
      <label className="grid gap-2 text-sm font-medium text-slate-300">
        <span>Choose quote or estimate</span>
        <select value={documentNumber} onChange={(event) => selectDocument(event.target.value)} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3">
          <option value="">Select a document</option>
          {documents.items.map((document) => <option key={document.id} value={document.number}>{document.number} · {document.title}</option>)}
        </select>
      </label>
      {selectedDocument ? <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm">
        <p className="font-semibold">{selectedDocument.title}</p>
        <p className="mt-1 text-slate-400">{selectedOverride ? "This document has its own customer-view override." : "This document currently follows the saved business default."}</p>
      </div> : null}
    </Card>

    {selectedDocument ? <Card>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => setDraft({ ...quotePresentationPresets.fixedPrice })}>Fixed price</Button>
        <Button type="button" variant="secondary" onClick={() => setDraft({ ...quotePresentationPresets.labourOnly })}>Labour only</Button>
        <Button type="button" variant="secondary" onClick={() => setDraft({ ...quotePresentationPresets.materialsAndLabour })}>Labour + materials</Button>
        <Button type="button" variant="secondary" onClick={() => setDraft({ ...quotePresentationPresets.fullBreakdown })}>Full breakdown</Button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Presentation mode</span><select value={draft.mode} onChange={(event) => update("mode", event.target.value as QuotePresentationSettings["mode"])} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option>Fixed price</option><option>Itemised</option></select></label>
          <h3 className="mt-5 font-semibold">Sections shown</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">{sectionOptions.map((option) => <label key={option.key} className={`flex min-h-12 items-center gap-3 rounded-xl border px-4 text-sm ${draft.mode === "Fixed price" ? "border-slate-800 bg-slate-950/40 text-slate-600" : "border-slate-700 bg-slate-950 text-slate-200"}`}><input type="checkbox" disabled={draft.mode === "Fixed price"} checked={Boolean(draft[option.key])} onChange={(event) => update(option.key, event.target.checked)} />{option.label}</label>)}</div>
        </div>
        <div>
          <h3 className="font-semibold">Price detail</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">{detailOptions.map((option) => <label key={option.key} className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-700 bg-slate-950 px-4 text-sm text-slate-200"><input type="checkbox" checked={Boolean(draft[option.key])} onChange={(event) => update(option.key, event.target.checked)} />{option.label}</label>)}</div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
        <div className="flex items-center gap-2 text-cyan-200"><Eye className="size-4" /><span className="text-sm font-semibold">Customer view</span></div>
        <p className="mt-2 text-sm text-slate-300">{quotePresentationSummary(draft)}</p>
        <p className="mt-2 text-xs text-slate-500">Your internal costs, markups and expected profit remain private.</p>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
        {saved ? <span className="flex items-center gap-2 text-sm font-semibold text-emerald-300"><CheckCircle2 className="size-4" />Override saved</span> : null}
        {selectedOverride ? <Button type="button" variant="secondary" onClick={removeOverride}><RotateCcw className="mr-2 size-4" />Use business default</Button> : null}
        <Button type="button" onClick={save}><Save className="mr-2 size-4" />Save for {selectedDocument.number}</Button>
      </div>
    </Card> : null}
  </div>;
}
