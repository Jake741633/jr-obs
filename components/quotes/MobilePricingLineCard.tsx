import { ChevronDown, Trash2 } from "lucide-react";
import { InputField } from "../ui/FormField";
import type { PricingLineItem } from "../../lib/models";

const categories: PricingLineItem["category"][] = ["Labour", "Materials", "Travel", "Parking", "Plant Hire", "Contingency", "Other"];
const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

interface MobilePricingLineCardProps {
  item: PricingLineItem;
  formattedTotal: string;
  onChange: (changes: Partial<PricingLineItem>) => void;
  onRemove: () => void;
}

export function MobilePricingLineCard({ item, formattedTotal, onChange, onRemove }: MobilePricingLineCardProps) {
  return (
    <details className="group rounded-2xl border border-slate-800 bg-slate-900/90 shadow-sm md:hidden">
      <summary className="flex min-h-20 cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-300">{item.category}</p>
          <p className="mt-1 truncate text-sm font-semibold text-white">{item.description || "Untitled pricing line"}</p>
          <p className="mt-1 text-xs text-slate-500">{item.quantity} × {money.format(item.unitPrice)}</p>
        </div>
        <strong className="shrink-0 whitespace-nowrap text-sm text-emerald-300">{formattedTotal}</strong>
        <ChevronDown className="size-5 shrink-0 text-slate-500 transition group-open:rotate-180" />
      </summary>

      <div className="space-y-3 border-t border-slate-800 p-4">
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
        <button type="button" onClick={onRemove} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 text-sm font-semibold text-red-300 active:bg-red-500/15">
          <Trash2 className="size-4" />Remove pricing line
        </button>
      </div>
    </details>
  );
}
