"use client";

import { FormEvent, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { makeId, useLocalStorageCollection } from "../../lib/storage";
import type { Job, RamsDocument, RamsStatus, RiskAssessmentItem, RiskLikelihood, RiskSeverity } from "../../lib/models";

const statuses: RamsStatus[] = ["Draft", "Ready for review", "Approved", "Superseded"];
const defaultPpe = ["Safety footwear", "Safety glasses", "Gloves"];
const blankRisk = { hazard: "", personsAtRisk: "Operatives and others on site", existingControls: "", likelihood: "2", severity: "3", furtherActions: "", residualLikelihood: "1", residualSeverity: "2", responsiblePerson: "Jake" };
const blankForm = { number: "", title: "", jobId: "", siteAddress: "", client: "", preparedBy: "Jake Rinaldi", preparedDate: "", reviewDate: "", status: "Draft" as RamsStatus, scopeOfWorks: "", methodStatement: "", emergencyArrangements: "Stop work, isolate the area, provide first aid where required and contact emergency services/site management.", ppeRequired: defaultPpe.join(", "), permitsRequired: "", approvalName: "", approvalDate: "", notes: "" };

function score(risk: Pick<RiskAssessmentItem, "likelihood" | "severity">) {
  return risk.likelihood * risk.severity;
}

function scoreLabel(value: number) {
  if (value >= 15) return "High";
  if (value >= 6) return "Medium";
  return "Low";
}

export default function RamsPage() {
  const documents = useLocalStorageCollection<RamsDocument>("jr-os-rams");
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const [form, setForm] = useState(blankForm);
  const [riskForm, setRiskForm] = useState(blankRisk);
  const [risks, setRisks] = useState<RiskAssessmentItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");

  const approved = documents.items.filter((item) => item.status === "Approved").length;
  const awaitingReview = documents.items.filter((item) => item.status === "Ready for review").length;
  const highRisks = documents.items.reduce((total, item) => total + item.risks.filter((risk) => score(risk) >= 15).length, 0);
  const filtered = useMemo(() => documents.items.filter((item) => !statusFilter || item.status === statusFilter), [documents.items, statusFilter]);

  function addRisk() {
    if (!riskForm.hazard.trim()) return;
    setRisks((current) => [...current, {
      id: makeId("risk"),
      hazard: riskForm.hazard.trim(),
      personsAtRisk: riskForm.personsAtRisk.trim(),
      existingControls: riskForm.existingControls.trim(),
      likelihood: Number(riskForm.likelihood) as RiskLikelihood,
      severity: Number(riskForm.severity) as RiskSeverity,
      furtherActions: riskForm.furtherActions.trim(),
      residualLikelihood: Number(riskForm.residualLikelihood) as RiskLikelihood,
      residualSeverity: Number(riskForm.residualSeverity) as RiskSeverity,
      responsiblePerson: riskForm.responsiblePerson.trim(),
    }]);
    setRiskForm(blankRisk);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const now = new Date().toISOString();
    const number = form.number.trim() || `RAMS-${String(documents.items.length + 1).padStart(4, "0")}`;
    documents.setItems((current) => [...current, {
      id: makeId("rams"), number, title: form.title.trim(), jobId: form.jobId || undefined,
      siteAddress: form.siteAddress.trim(), client: form.client.trim(), preparedBy: form.preparedBy.trim(), preparedDate: form.preparedDate,
      reviewDate: form.reviewDate, status: form.status, scopeOfWorks: form.scopeOfWorks.trim(), methodStatement: form.methodStatement.trim(),
      emergencyArrangements: form.emergencyArrangements.trim(), ppeRequired: form.ppeRequired.split(",").map((item) => item.trim()).filter(Boolean),
      permitsRequired: form.permitsRequired.split(",").map((item) => item.trim()).filter(Boolean), risks, approvalName: form.approvalName.trim(),
      approvalDate: form.approvalDate, notes: form.notes.trim(), createdAt: now, updatedAt: now,
    }]);
    setForm(blankForm);
    setRisks([]);
    setShowForm(false);
  }

  function updateStatus(document: RamsDocument, status: RamsStatus) {
    const now = new Date().toISOString();
    documents.setItems((current) => current.map((item) => item.id === document.id ? { ...item, status, approvalDate: status === "Approved" && !item.approvalDate ? now.slice(0, 10) : item.approvalDate, updatedAt: now } : item));
  }

  return (
    <main className="space-y-6">
      <PageHeader title="RAMS & Risk Assessments" description="Prepare method statements, assess electrical site risks and keep approvals linked to each job." action={<Button onClick={() => setShowForm((value) => !value)}><Plus className="h-4 w-4" />New RAMS</Button>} />

      <section className="grid gap-4 md:grid-cols-4">
        <Card><ClipboardCheck className="h-5 w-5" /><p className="mt-3 text-3xl font-semibold">{documents.items.length}</p><p className="text-sm text-slate-400">RAMS documents</p></Card>
        <Card><CheckCircle2 className="h-5 w-5" /><p className="mt-3 text-3xl font-semibold">{approved}</p><p className="text-sm text-slate-400">Approved</p></Card>
        <Card><ShieldCheck className="h-5 w-5" /><p className="mt-3 text-3xl font-semibold">{awaitingReview}</p><p className="text-sm text-slate-400">Awaiting review</p></Card>
        <Card><AlertTriangle className="h-5 w-5" /><p className="mt-3 text-3xl font-semibold">{highRisks}</p><p className="text-sm text-slate-400">High initial risks</p></Card>
      </section>

      {showForm && <Card><form onSubmit={submit} className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <InputField label="RAMS number" placeholder="Automatic if blank" value={form.number} onChange={(event) => setForm({ ...form, number: event.target.value })} />
          <InputField label="Title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
          <label className="space-y-1 text-sm"><span>Linked job</span><select className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3" value={form.jobId} onChange={(event) => { const job = jobs.items.find((item) => item.id === event.target.value); setForm({ ...form, jobId: event.target.value, siteAddress: job?.siteAddress || form.siteAddress }); }}><option value="">No linked job</option>{jobs.items.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>
          <InputField label="Client / principal contractor" value={form.client} onChange={(event) => setForm({ ...form, client: event.target.value })} />
          <InputField label="Site address" value={form.siteAddress} onChange={(event) => setForm({ ...form, siteAddress: event.target.value })} required />
          <InputField label="Prepared by" value={form.preparedBy} onChange={(event) => setForm({ ...form, preparedBy: event.target.value })} required />
          <InputField label="Prepared date" type="date" value={form.preparedDate} onChange={(event) => setForm({ ...form, preparedDate: event.target.value })} />
          <InputField label="Review date" type="date" value={form.reviewDate} onChange={(event) => setForm({ ...form, reviewDate: event.target.value })} />
          <label className="space-y-1 text-sm"><span>Status</span><select className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as RamsStatus })}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
          <InputField label="PPE required (comma separated)" value={form.ppeRequired} onChange={(event) => setForm({ ...form, ppeRequired: event.target.value })} />
          <InputField label="Permits required (comma separated)" value={form.permitsRequired} onChange={(event) => setForm({ ...form, permitsRequired: event.target.value })} />
          <InputField label="Approval name" value={form.approvalName} onChange={(event) => setForm({ ...form, approvalName: event.target.value })} />
          <InputField label="Approval date" type="date" value={form.approvalDate} onChange={(event) => setForm({ ...form, approvalDate: event.target.value })} />
        </div>
        <TextareaField label="Scope of works" value={form.scopeOfWorks} onChange={(event) => setForm({ ...form, scopeOfWorks: event.target.value })} required />
        <TextareaField label="Method statement / safe system of work" value={form.methodStatement} onChange={(event) => setForm({ ...form, methodStatement: event.target.value })} required />
        <TextareaField label="Emergency arrangements" value={form.emergencyArrangements} onChange={(event) => setForm({ ...form, emergencyArrangements: event.target.value })} />

        <div className="rounded-xl border border-slate-800 p-4">
          <h2 className="text-lg font-semibold">Add risk assessment item</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <InputField label="Hazard" value={riskForm.hazard} onChange={(event) => setRiskForm({ ...riskForm, hazard: event.target.value })} />
            <InputField label="Persons at risk" value={riskForm.personsAtRisk} onChange={(event) => setRiskForm({ ...riskForm, personsAtRisk: event.target.value })} />
            <TextareaField label="Existing controls" value={riskForm.existingControls} onChange={(event) => setRiskForm({ ...riskForm, existingControls: event.target.value })} />
            <TextareaField label="Further actions" value={riskForm.furtherActions} onChange={(event) => setRiskForm({ ...riskForm, furtherActions: event.target.value })} />
            <InputField label="Initial likelihood (1-5)" type="number" min="1" max="5" value={riskForm.likelihood} onChange={(event) => setRiskForm({ ...riskForm, likelihood: event.target.value })} />
            <InputField label="Initial severity (1-5)" type="number" min="1" max="5" value={riskForm.severity} onChange={(event) => setRiskForm({ ...riskForm, severity: event.target.value })} />
            <InputField label="Residual likelihood (1-5)" type="number" min="1" max="5" value={riskForm.residualLikelihood} onChange={(event) => setRiskForm({ ...riskForm, residualLikelihood: event.target.value })} />
            <InputField label="Residual severity (1-5)" type="number" min="1" max="5" value={riskForm.residualSeverity} onChange={(event) => setRiskForm({ ...riskForm, residualSeverity: event.target.value })} />
            <InputField label="Responsible person" value={riskForm.responsiblePerson} onChange={(event) => setRiskForm({ ...riskForm, responsiblePerson: event.target.value })} />
          </div>
          <Button type="button" className="mt-4" onClick={addRisk}>Add risk</Button>
          {risks.length > 0 && <div className="mt-4 space-y-2">{risks.map((risk) => <div key={risk.id} className="flex items-start justify-between gap-3 rounded-lg bg-slate-950 p-3"><div><p className="font-medium">{risk.hazard}</p><p className="text-sm text-slate-400">Initial {score(risk)} ({scoreLabel(score(risk))}) · Residual {risk.residualLikelihood * risk.residualSeverity}</p></div><Button type="button" variant="secondary" onClick={() => setRisks((current) => current.filter((item) => item.id !== risk.id))}><Trash2 className="h-4 w-4" /></Button></div>)}</div>}
        </div>
        <TextareaField label="Additional notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        <Button type="submit">Save RAMS</Button>
      </form></Card>}

      <Card><select className="rounded-lg border border-slate-700 bg-slate-950 p-2" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select></Card>

      <section className="space-y-4">{filtered.map((document) => <Card key={document.id}><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-slate-400">{document.number}</p><h2 className="text-xl font-semibold">{document.title}</h2><p className="text-sm text-slate-400">{document.siteAddress} · Prepared by {document.preparedBy || "Not set"}</p></div><div className="text-right"><select className="rounded-lg border border-slate-700 bg-slate-950 p-2" value={document.status} onChange={(event) => updateStatus(document, event.target.value as RamsStatus)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select><p className="mt-2 text-sm text-slate-400">{document.risks.length} risk item{document.risks.length === 1 ? "" : "s"}</p></div></div>
        <div className="mt-4 grid gap-3 md:grid-cols-3"><div className="rounded-lg bg-slate-950 p-3"><p className="text-xs uppercase text-slate-500">Scope</p><p className="mt-1 text-sm">{document.scopeOfWorks || "Not recorded"}</p></div><div className="rounded-lg bg-slate-950 p-3"><p className="text-xs uppercase text-slate-500">PPE</p><p className="mt-1 text-sm">{document.ppeRequired.join(", ") || "Not recorded"}</p></div><div className="rounded-lg bg-slate-950 p-3"><p className="text-xs uppercase text-slate-500">Highest risk</p><p className="mt-1 text-sm">{document.risks.length ? Math.max(...document.risks.map(score)) : 0}</p></div></div>
        <div className="mt-4 flex justify-end"><Button variant="secondary" onClick={() => documents.remove((item) => item.id === document.id)}><Trash2 className="h-4 w-4" />Delete</Button></div>
      </Card>)}{filtered.length === 0 && <Card><p className="text-slate-400">No RAMS documents match this filter.</p></Card>}</section>
    </main>
  );
}