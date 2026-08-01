import { Trash2 } from "lucide-react";
import { InputField } from "../ui/FormField";
import type { PricingLineItem } from "../../lib/models";

const categories: PricingLineItem["category"][] = ["Labour", "Materials", "Travel", "Parking", "Plant Hire", "Contingency", "Other"];

interface MobilePricingLineCardProps {
  item: PricingLineItem;
  formattedTotal: string;
  onChange: (changes: Partial<PricingLineItem>) => void;
  onRemove: () => void;
}

export function MobilePricingLineCard({ item, formattedTotal, onChange, onRemove }: MobilePricingLineCardProps) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-sm md:hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-300">{item.category}</p>
          <p className="mt-1 truncate text-sm font-semibold text-white">{item.description || "Untitled pricing line"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <strong className="whitespace-nowrap text-sm text-emerald-300">{formattedTotal}</strong>
          <button type="button" onClick={onRemove} aria-label={`Remove ${item.description || "pricing line"}`} className="grid size-11 place-items-center rounded-xl border border-red-500/20 bg-red-500/5 text-red-300 active:bg-red-500/15">
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <InputField label="Description" value={item.description} onChange={(event) => onChange({ description: event.target.value })} />
        <label className="grid gap-2 text-sm font-medium text-slate-300">
          <span>Section</span>
          <select value={item.category} onChange={(event) => onChange({ category: event.target.value as PricingLineItem["category"] })} className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-white outline-none focus:border-cyan-400">
            {categories.map((category) => <option key={category}>{category}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <InputField label="Quantity" type="number" min="0.01" step="0.01" value={String(item.quantity)} onChange={(event) => onChange({ quantity: Number(event.target.value) })} />
          <InputField label="Unit cost (£)" type="number" min="0" step="0.01" value={String(item.unitCost ?? item.unitPrice)} onChange={(event) => onChange({ unitCost: Number(event.target.value) })} />
        </div>
        <InputField label="Customer price (£)" type="number" min="0" step="0.01" value={String(item.unitPrice)} onChange={(event) => onChange({ unitPrice: Number(event.target.value) })} />
      </div>
    </article>
  );
}
