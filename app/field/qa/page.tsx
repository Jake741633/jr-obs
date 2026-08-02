"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Plus, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { TextareaField } from "../../../components/ui/FormField";
import { PageHeader } from "../../../components/ui/PageHeader";
import { useJobsCollection, useJobQaInspectionsCollection, useJobTasksCollection, useJobTimelineCollection, useTeamCollection } from "../../../lib/cloud/coreBusinessCollections";
import { buildQaInspection, completeQaInspection, failedQaTask, jobQaTypes, qaCompletion, qaSummary, qaTimelineEntry } from "../../../lib/jobQa-core.mjs";
import { qaTaskCategory } from "../../../lib/jobQaTypes";
import { makeId } from "../../../lib/storage";
import type { JobQaInspection, JobQaInspectionType } from "../../../lib/jobQaTypes";
import type { JobTask } from "../../../lib/models";

const blankForm = { jobId: "", type: "First fix" as JobQaInspectionType, inspectorId: "", notes: "" };

export default function MobileQaPage() {
  const jobs = useJobsCollection();
  const inspections = useJobQaInspectionsCollection();
  const tasks = useJobTasksCollection();
  const timeline = useJobTimelineCollection();
  const team = useTeamCollection();
  const [form, setForm] = useState(blankForm);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [message, setMessage] = useState("");

  const activeJobs = useMemo(() => jobs.items.filter((job) => !["Complete", "Invoiced", "Paid", "Cancelled"].includes(job.status)), [jobs.items]);
  const visibleJobId = selectedJobId || form.jobId || activeJobs[0]?.id || "";
  const visibleInspections = useMemo(() => inspections.items.filter((inspection) => inspection.jobId === visibleJobId).toSorted((a, b) => b.inspectedAt.localeCompare(a.inspectedAt)), [inspections.items, visibleJobId]);
  const summary = useMemo(() => qaSummary(inspections.items, visibleJobId), [inspections.items, visibleJobId]);
  const ready = [jobs, inspections, tasks, timeline, team].every((collection) => collection.isReady);

  if (!ready) return <Card>Loading mobile QA inspections…</Card>;

  function createInspection(event: FormEvent) {
    event.preventDefault();
    const jobId = form.jobId || visibleJobId;
    const inspector = team.items.find((member) => member.id === form.inspectorId);
    try {
      const record = buildQaInspection({ id: makeId("qa"), jobId, type: form.type, inspectorId: inspector?.id, inspectorName: inspector?.name || "JR OS engineer", notes: form.notes.trim(), now: new Date().toISOString() }) as JobQaInspection;
      inspections.setItems((current) => [record, ...current]);
      setSelectedJobId(jobId);
      setForm({ ...blankForm, jobId, inspectorId: form.inspectorId });
      setMessage(`${record.type} QA inspection created.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create QA inspection.");
    }
  }

  function toggleCheck(inspection: JobQaInspection, checkId: string) {
    const now = new Date().toISOString();
    inspections.setItems((current) => current.map((item) => item.id === inspection.id ? { ...item, checks: item.checks.map((check) => check.id === checkId ? { ...check, completed: !check.completed } : check), updatedAt: now } : item));
  }

  function finishInspection(inspection: JobQaInspection, result: "Pass" | "Fail") {
    const now = new Date().toISOString();
    try {
      const updated = completeQaInspection({ inspection, result, notes: inspection.notes, now }) as JobQaInspection;
      inspections.setItems((current) => current.map((item) => item.id === inspection.id ? updated : item));
      timeline.setItems((current) => [qaTimelineEntry({ inspection: updated, timelineId: makeId("timeline"), completedBy: updated.inspectorName, now }), ...current]);
      const task = failedQaTask({ inspection: updated, taskId: makeId("snag"), now });
      if (task) {
        const typedTask: JobTask = { ...task, category: qaTaskCategory(updated.type) };
        tasks.setItems((current) => [typedTask, ...current]);
      }
      setMessage(result === "Pass" ? `${inspection.type} QA passed.` : `${inspection.type} QA failed and a linked snag was created.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to complete QA inspection.");
    }
  }

  return <div className="space-y-5 pb-24 sm:space-y-6 sm:pb-0">
    <PageHeader eyebrow="Job Management Pro" title="Mobile QA inspections" description="Run first fix, second fix, testing, commissioning and handover checks from your phone. Failed checks create linked snag actions automatically." />

    <Card>
      <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Job QA record</span><select value={visibleJobId} onChange={(event) => { setSelectedJobId(event.target.value); setForm((current) => ({ ...current, jobId: event.target.value })); }} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base"><option value="">Choose job</option>{activeJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>
    </Card>

    <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <Card><p className="text-xs text-slate-400">Inspections</p><p className="mt-2 text-3xl font-bold">{summary.total}</p></Card>
      <Card><p className="text-xs text-slate-400">Passed</p><p className="mt-2 text-3xl font-bold text-emerald-300">{summary.passed}</p></Card>
      <Card><p className="text-xs text-slate-400">Failed</p><p className="mt-2 text-3xl font-bold text-rose-300">{summary.failed}</p></Card>
      <Card><p className="text-xs text-slate-400">Pending</p><p className="mt-2 text-3xl font-bold text-amber-200">{summary.pending}</p></Card>
      <Card className="col-span-2 sm:col-span-1"><p className="text-xs text-slate-400">QA complete</p><p className="mt-2 text-3xl font-bold text-cyan-300">{summary.completion}%</p></Card>
    </section>

    {message ? <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}

    <Card>
      <form onSubmit={createInspection} className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Linked job</span><select required value={form.jobId} onChange={(event) => setForm({ ...form, jobId: event.target.value })} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base"><option value="">Choose job</option>{activeJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Inspection type</span><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as JobQaInspectionType })} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base">{jobQaTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Inspector</span><select value={form.inspectorId} onChange={(event) => setForm({ ...form, inspectorId: event.target.value })} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base"><option value="">JR OS engineer</option>{team.items.filter((member) => member.status === "Active").map((member) => <option key={member.id} value={member.id}>{member.name} · {member.role}</option>)}</select></label>
        <div className="md:col-span-2"><TextareaField label="Inspection notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Area inspected, limitations or supervisor notes…" /></div>
        <div className="md:col-span-2"><Button type="submit" className="w-full"><Plus className="mr-2 size-4" />Create QA inspection</Button></div>
      </form>
    </Card>

    <section className="space-y-4">
      {!visibleInspections.length ? <Card><ClipboardCheck className="size-5 text-slate-500" /><h2 className="mt-3 font-semibold">No QA inspections recorded</h2><p className="mt-2 text-sm text-slate-400">Choose a job and create the first quality inspection above.</p></Card> : visibleInspections.map((inspection) => {
        const completion = qaCompletion(inspection);
        return <Card key={inspection.id} className={inspection.result === "Fail" ? "border-rose-400/30" : inspection.result === "Pass" ? "border-emerald-400/30" : undefined}>
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{inspection.type}</p><h2 className="mt-1 text-lg font-bold">{inspection.inspectorName}</h2></div><span className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold">{inspection.result}</span></div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-cyan-400" style={{ width: `${completion}%` }} /></div><p className="mt-2 text-xs text-slate-400">Checklist {completion}% complete</p>
          <div className="mt-4 grid gap-2">{inspection.checks.map((check) => <button key={check.id} type="button" disabled={inspection.result !== "Pending"} onClick={() => toggleCheck(inspection, check.id)} className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/50 px-4 text-left text-sm disabled:opacity-70">{check.completed ? <CheckCircle2 className="size-5 shrink-0 text-emerald-300" /> : <span className="size-5 shrink-0 rounded-full border border-slate-600" />}<span>{check.label}</span></button>)}</div>
          {inspection.notes ? <p className="mt-4 rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-sm text-slate-300">{inspection.notes}</p> : null}
          {inspection.result === "Pending" ? <div className="mt-4 grid grid-cols-2 gap-2"><Button type="button" variant="secondary" onClick={() => finishInspection(inspection, "Fail")}><XCircle className="mr-2 size-4" />Fail</Button><Button type="button" onClick={() => finishInspection(inspection, "Pass")}><ShieldCheck className="mr-2 size-4" />Pass</Button></div> : inspection.result === "Fail" ? <p className="mt-4 flex items-center gap-2 text-sm text-rose-300"><AlertTriangle className="size-4" />Linked snag action created</p> : <p className="mt-4 flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 className="size-4" />Inspection passed</p>}
          <Link href={`/jobs/${inspection.jobId}`} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-700 px-4 text-sm font-semibold">Open full job</Link>
        </Card>;
      })}
    </section>
  </div>;
}
