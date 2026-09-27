import { Check, Circle, Route, SearchCheck } from "lucide-react";
import type { FixedPriceWorkflow, FixedPriceWorkflowType } from "../../lib/models";

interface FixedPriceWorkflowCardProps {
  value: FixedPriceWorkflow;
  onChange: (value: FixedPriceWorkflow) => void;
  quoteSaved: boolean;
  convertedToJob: boolean;
}

const workflowTypes: Array<{ type: FixedPriceWorkflowType; title: string; description: string }> = [
  { type: "Direct fixed price", title: "Direct fixed price", description: "Use when the scope is already clear and can be priced now." },
  { type: "Fault finding to fixed price", title: "Fault finding first", description: "Record the assessment, recommendation and then issue a fixed price for the remedial work." },
];

export function FixedPriceWorkflowCard({ value, onChange, quoteSaved, convertedToJob }: FixedPriceWorkflowCardProps) {
  const assessmentRoute = value.type === "Fault finding to fixed price";
  const stages = assessmentRoute
    ? [
      { label: "Initial visit", complete: value.initialVisitCompleted },
      { label: "Fault finding", complete: value.faultFindingCompleted },
      { label: "Recommend works", complete: Boolean(value.recommendation.trim()) },
      { label: "Fixed-price quotation", complete: quoteSaved },
      { label: "Convert to Job", complete: convertedToJob },
      { label: "Invoice from completed Job", complete: false },
    ]
    : [
      { label: "Confirm scope", complete: Boolean(value.recommendation.trim()) },
      { label: "Fixed-price quotation", complete: quoteSaved },
      { label: "Convert to Job", complete: convertedToJob },
      { label: "Invoice from completed Job", complete: false },
    ];

  return <section className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 sm:p-5">
    <div className="flex items-start gap-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300"><Route className="size-5" /></div>
      <div><h2 className="font-semibold">Fixed-price workflow</h2><p className="mt-1 text-sm text-slate-400">Keep fault finding separate from the fixed-price remedial quote, then carry the accepted price into the Job and Invoice.</p></div>
    </div>

    <div className="mt-4 grid gap-2 sm:grid-cols-2" role="group" aria-label="Fixed-price workflow type">
      {workflowTypes.map((option) => <button key={option.type} type="button" onClick={() => onChange({ ...value, type: option.type })} className={`min-h-20 rounded-xl border p-3 text-left transition ${value.type === option.type ? "border-cyan-400 bg-cyan-400/10" : "border-slate-700 bg-slate-950/70"}`}>
        <span className="block text-sm font-semibold text-white">{option.title}</span>
        <span className="mt-1 block text-xs leading-5 text-slate-400">{option.description}</span>
      </button>)}
    </div>

    {assessmentRoute ? <div className="mt-4 grid gap-2 sm:grid-cols-2">
      <WorkflowCheck label="Initial visit completed" checked={value.initialVisitCompleted} onChange={(checked) => onChange({ ...value, initialVisitCompleted: checked })} />
      <WorkflowCheck label="Fault finding completed" checked={value.faultFindingCompleted} onChange={(checked) => onChange({ ...value, faultFindingCompleted: checked })} />
    </div> : null}

    <label className="mt-4 grid gap-2 text-sm font-medium text-slate-300">
      <span>{assessmentRoute ? "Recommended works" : "Confirmed fixed-price scope"}</span>
      <textarea value={value.recommendation} onChange={(event) => onChange({ ...value, recommendation: event.target.value })} rows={3} placeholder={assessmentRoute ? "Describe the remedial works recommended after fault finding." : "Summarise the works that the fixed price covers."} className="min-h-24 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-base text-white outline-none focus:border-cyan-400 sm:text-sm" />
    </label>

    <div className="mt-5 overflow-x-auto pb-1">
      <ol className="flex min-w-max items-center gap-2" aria-label="Quote to invoice progress">
        {stages.map((stage, index) => <li key={stage.label} className="flex items-center gap-2">
          <span className={`flex min-h-10 items-center gap-2 rounded-full border px-3 text-xs font-semibold ${stage.complete ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-slate-700 bg-slate-950 text-slate-500"}`}>
            {stage.complete ? <Check className="size-3.5" /> : index === stages.findIndex((item) => !item.complete) ? <SearchCheck className="size-3.5 text-amber-300" /> : <Circle className="size-3" />}{stage.label}
          </span>
          {index < stages.length - 1 ? <span aria-hidden className="h-px w-4 bg-slate-700" /> : null}
        </li>)}
      </ol>
    </div>
  </section>;
}

function WorkflowCheck({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-700 bg-slate-950 px-4 text-sm font-medium text-slate-200">
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-5 accent-cyan-400" />
    <span>{label}</span>
  </label>;
}
