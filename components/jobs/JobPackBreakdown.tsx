import type { JobPack, Material } from "../../lib/models";
import { hasLegacyOtherAllowances, jobPackTotals, packLineCost } from "../../lib/jobPackCatalogue";
import { MaterialShareActions } from "../materials/MaterialShareActions";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
export function JobPackBreakdown({ pack, materials, contextKey = "", canUseMaterial }: {
  pack: JobPack; materials: Material[]; contextKey?: string; canUseMaterial?: (material: Material) => boolean;
}) {
  const totals = jobPackTotals(pack, materials);
  const legacyCharges = hasLegacyOtherAllowances(pack.notes);
  const charges = Array.isArray(pack.otherAllowances) ? pack.otherAllowances : [];
  return <div className="mt-4 space-y-4 text-sm">
    <dl className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl bg-slate-950 p-3"><dt className="text-slate-400">Estimated buying cost for materials</dt><dd className="font-semibold">{totals.materialsCost === null ? `Incomplete (${totals.missingCosts} missing costs)` : money.format(totals.materialsCost)}</dd></div>
      <div className="rounded-xl bg-slate-950 p-3"><dt className="text-slate-400">Materials selling allowance</dt><dd className="font-semibold">{money.format(totals.materialsSell)}</dd></div>
      <div className="rounded-xl bg-slate-950 p-3"><dt className="text-slate-400">Internal labour allowance</dt><dd className="font-semibold">{pack.labourHours}h · {totals.labour === null ? "Check amounts" : money.format(totals.labour)}</dd></div>
      <div className="rounded-xl bg-slate-950 p-3"><dt className="text-slate-400">Other charges</dt><dd className="font-semibold">{money.format(totals.otherSell)}</dd></div>
      <div className="rounded-xl bg-cyan-400/10 p-3"><dt className="text-cyan-200">Guide job total</dt><dd className="text-lg font-bold">{legacyCharges ? "Review legacy charges" : totals.total === null ? "Check invalid amounts" : money.format(totals.total)}</dd></div>
    </dl>
    {legacyCharges ? <p role="alert" className="text-amber-200">Verify the old amounts against the original quote, enter or confirm them under Other charges, then remove the old list and its heading from Notes. Retain unrelated scope notes.</p> : null}
    {charges.length ? <section aria-label="Other charges" className="rounded-xl border border-slate-700 p-3">
      <h3 className="font-semibold">Other charges</h3>
      <ul className="mt-3 space-y-3">{charges.map((line, index) => {
        if (!line || typeof line !== "object") return <li key={index} className="text-amber-200">Invalid other charge. Edit the pack to review it.</li>;
        const validPrice = typeof line.unitPrice === "number" && Number.isFinite(line.unitPrice) && line.unitPrice >= 0;
        const validQuantity = typeof line.quantity === "number" && Number.isFinite(line.quantity) && line.quantity > 0;
        return <li key={index} className="rounded-xl bg-slate-950 p-3">
          <p className="break-words font-semibold">{typeof line.description === "string" ? line.description : "Invalid other charge"}</p>
          <p className="text-slate-400">Category {line.category === undefined ? "Other" : typeof line.category === "string" ? line.category : "Check category"}</p>
          <p>{validQuantity ? line.quantity : "Check quantity"} × {validPrice ? money.format(line.unitPrice) : "Check price"} = {validPrice && validQuantity ? money.format(line.quantity * line.unitPrice) : "Check amounts"}</p>
          {line.unitCost !== undefined ? <p className="text-slate-400">Buying cost {typeof line.unitCost === "number" && Number.isFinite(line.unitCost) && line.unitCost >= 0 ? money.format(line.unitCost) : "Check cost"} each</p> : null}
        </li>;
      })}</ul>
    </section> : null}
    <p className="text-xs text-amber-200">Internal estimate, not a customer quote. No VAT is added here. Review the scope, quantities, your buying-cost VAT basis and the quote’s VAT settings before use.</p>
    <details className="rounded-xl border border-slate-700 p-3">
      <summary className="min-h-12 cursor-pointer py-3 font-semibold">Materials, assumptions & exclusions ({pack.materials.length} lines)</summary>
      <p className="mb-3 text-xs text-slate-400">Saved line costs are allowances, not live prices. Older lines without a saved cost use a uniquely linked library cost. Edit the pack to update quantities and allowances.</p>
      <ul className="space-y-3">{pack.materials.map(line => {
        const matches = line.materialId ? materials.filter(item => item.id === line.materialId) : [];
        const linked = matches.length === 1 ? matches[0] : null, cost = packLineCost(line, materials);
        return <li key={line.id} className="space-y-2 rounded-xl bg-slate-950 p-3">
          <p className="break-words font-semibold">{line.description}</p>
          <p>{line.quantity} {linked?.unit || "units"} · Sell {money.format(line.unitPrice)} each · {cost === null ? "Cost not recorded" : `Buy ${money.format(cost)} each (${line.unitCost === undefined ? "library cost" : "saved allowance"})`}</p>
          {linked && canUseMaterial && (linked.stockCode || linked.supplierUrl) ? <MaterialShareActions material={linked} contextKey={JSON.stringify([contextKey, linked.id])} canUse={() => canUseMaterial(linked)} /> : null}
        </li>;
      })}</ul>
      {!pack.materials.length ? <p className="text-slate-400">No materials allowance recorded. Add any required consumables before quoting.</p> : null}
      <p className="mt-4 whitespace-pre-wrap break-words"><strong>Scope notes & exclusions: </strong>{pack.notes || "Confirm scope and exclusions for the actual job."}</p>
      {pack.internalNotes ? <p className="mt-3 whitespace-pre-wrap break-words text-amber-200"><strong>Internal pricing notes: </strong>{pack.internalNotes}</p> : null}
      <p className="mt-3 whitespace-pre-wrap break-words"><strong>Testing: </strong>{pack.testingRequirements}</p>
      <p className="mt-3 whitespace-pre-wrap break-words"><strong>Certification: </strong>{pack.certificatesRequired}</p>
    </details>
  </div>;
}
