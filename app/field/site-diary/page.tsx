"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, HardHat, PackageCheck, ShieldAlert, UsersRound } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { InputField, TextareaField } from "../../../components/ui/FormField";
import { PageHeader } from "../../../components/ui/PageHeader";
import { useJobsCollection, useJobTimelineCollection, useSiteDiariesCollection, useTeamCollection } from "../../../lib/cloud/coreBusinessCollections";
import { isJobInactiveStatus, siteDiaryTimelineEntry } from "../../../lib/jobManagement-core.mjs";
import { buildDailyProgressSummary, dailyProgressWarnings } from "../../../lib/siteDiaryDailyProgress-core.mjs";
import { makeId } from "../../../lib/storage";
import type { JobTimelineEntry, SiteDiaryEntry } from "../../../lib/models";

type DailyProgressEntry = SiteDiaryEntry & {
  plantAndEquipment?: string;
  deliveriesReceived?: string;
  toolboxTalks?: string;
  engineerSignatureName?: string;
  engineerSignedAt?: string;
  customerSignOffName?: string;
  customerSignOffNotes?: string;
  customerSignedAt?: string;
  dailySummary?: string;
};

const today = () => new Date().toISOString().slice(0, 10);
const nowTime = () => new Date().toTimeString().slice(0, 5);

const blankForm = {
  jobId: "",
  workDate: today(),
  startedAt: "",
  finishedAt: "",
  breakMinutes: "0",
  completedBy: "Jake",
  staffPresent: [] as string[],
  otherStaffPresent: "",
  weather: "",
  workCompleted: "",
  materialsUsed: "",
  materialsRequired: "",
  plantAndEquipment: "",
  deliveriesReceived: "",
  delays: "",
  builderInstructions: "",
  customerInstructions: "",
  issuesAndRisks: "",
  toolboxTalks: "",
  followUpActions: "",
  voiceNoteTranscript: "",
  engineerSignatureName: "",
  customerSignOffName: "",
  customerSignOffNotes: "",
};

export default function MobileSiteDiaryPage() {
  const jobs = useJobsCollection();
  const diaries = useSiteDiariesCollection();
  const timeline = useJobTimelineCollection();
  const team = useTeamCollection();
  const [form, setForm] = useState(blankForm);
  const [message, setMessage] = useState("");

  const activeJobs = useMemo(() => jobs.items.filter((job) => !isJobInactiveStatus(job.status)), [jobs.items]);
  const ready = [jobs, diaries, timeline, team].every((collection) => collection.isReady);

  function toggleStaff(memberId: string) {
    setForm((current) => ({
      ...current,
      staffPresent: current.staffPresent.includes(memberId)
        ? current.staffPresent.filter((id) => id !== memberId)
        : [...current.staffPresent, memberId],
    }));
  }

  function saveDiary(event: FormEvent) {
    event.preventDefault();
    if (!form.jobId) return setMessage("Choose a job before saving the daily progress record.");
    if (!form.workCompleted.trim()) return setMessage("Record the work completed before saving.");

    const now = new Date().toISOString();
    const base: DailyProgressEntry = {
      id: makeId("diary"),
      jobId: form.jobId,
      workDate: form.workDate || today(),
      startedAt: form.startedAt,
      finishedAt: form.finishedAt,
      breakMinutes: Math.max(0, Number(form.breakMinutes || 0)),
      completedBy: form.completedBy.trim() || "JR OS engineer",
      staffPresent: form.staffPresent,
      otherStaffPresent: form.otherStaffPresent.trim(),
      workCompleted: form.workCompleted.trim(),
      delays: form.delays.trim(),
      builderInstructions: form.builderInstructions.trim(),
      customerRequests: form.customerInstructions.trim(),
      customerInstructions: form.customerInstructions.trim(),
      materialsUsed: form.materialsUsed.trim(),
      materialsRequired: form.materialsRequired.trim(),
      photos: [],
      photoDocumentIds: [],
      voiceNotes: form.voiceNoteTranscript.trim(),
      voiceNoteTranscript: form.voiceNoteTranscript.trim(),
      weather: form.weather.trim(),
      issuesAndRisks: form.issuesAndRisks.trim(),
      followUpActions: form.followUpActions.trim(),
      plantAndEquipment: form.plantAndEquipment.trim(),
      deliveriesReceived: form.deliveriesReceived.trim(),
      toolboxTalks: form.toolboxTalks.trim(),
      engineerSignatureName: form.engineerSignatureName.trim(),
      engineerSignedAt: form.engineerSignatureName.trim() ? now : "",
      customerSignOffName: form.customerSignOffName.trim(),
      customerSignOffNotes: form.customerSignOffNotes.trim(),
      customerSignedAt: form.customerSignOffName.trim() ? now : "",
      dailySummary: "",
      createdAt: now,
      updatedAt: now,
    };
    const entry: DailyProgressEntry = { ...base, dailySummary: buildDailyProgressSummary(base) };
    const timelineEntry = siteDiaryTimelineEntry({ entry, timelineId: makeId("timeline"), completedBy: entry.completedBy, now }) as JobTimelineEntry;

    diaries.setItems((current) => [entry, ...current]);
    timeline.setItems((current) => [timelineEntry, ...current]);
    const warningCount = dailyProgressWarnings(entry).length;
    setMessage(`Daily progress saved and added to the job timeline${warningCount ? ` with ${warningCount} action${warningCount === 1 ? "" : "s"} to review` : ""}.`);
    setForm({ ...blankForm, jobId: form.jobId, completedBy: form.completedBy, workDate: today() });
  }

  if (!ready) return <Card>Loading mobile site diary…</Card>;

  return <div className="space-y-5 pb-24 sm:space-y-6 sm:pb-0">
    <PageHeader eyebrow="Job Management Pro" title="Site diary & daily progress" description="Capture labour, progress, deliveries, plant, safety actions and sign-off from site using the existing cloud and offline diary record." />

    {message ? <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-sm text-cyan-100">{message}</div> : null}

    <form onSubmit={saveDiary} className="space-y-4">
      <Card className="space-y-4">
        <h2 className="flex items-center gap-2 font-semibold"><ClipboardList className="size-5 text-cyan-300" />Job and working time</h2>
        <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Job</span><select required value={form.jobId} onChange={(event) => setForm({ ...form, jobId: event.target.value })} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base"><option value="">Choose job</option>{activeJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>
        <div className="grid gap-3 sm:grid-cols-2"><InputField label="Work date" type="date" value={form.workDate} onChange={(event) => setForm({ ...form, workDate: event.target.value })} /><InputField label="Completed by" value={form.completedBy} onChange={(event) => setForm({ ...form, completedBy: event.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><InputField label="Started" type="time" value={form.startedAt} onChange={(event) => setForm({ ...form, startedAt: event.target.value })} /><InputField label="Finished" type="time" value={form.finishedAt} onChange={(event) => setForm({ ...form, finishedAt: event.target.value })} /><div className="col-span-2 sm:col-span-1"><InputField label="Break minutes" type="number" min="0" value={form.breakMinutes} onChange={(event) => setForm({ ...form, breakMinutes: event.target.value })} /></div></div>
        <div className="grid grid-cols-2 gap-2"><Button type="button" variant="secondary" onClick={() => setForm((current) => ({ ...current, startedAt: nowTime() }))}>Set arrival</Button><Button type="button" variant="secondary" onClick={() => setForm((current) => ({ ...current, finishedAt: nowTime() }))}>Set departure</Button></div>
      </Card>

      <Card className="space-y-4">
        <h2 className="flex items-center gap-2 font-semibold"><UsersRound className="size-5 text-cyan-300" />Labour on site</h2>
        <div className="grid gap-2">{team.items.filter((member) => member.status === "Active").map((member) => <button key={member.id} type="button" onClick={() => toggleStaff(member.id)} className="flex min-h-12 items-center justify-between rounded-xl border border-slate-700 px-4 text-left text-sm"><span>{member.name} · {member.role}</span>{form.staffPresent.includes(member.id) ? <CheckCircle2 className="size-5 text-emerald-300" /> : <span className="size-5 rounded-full border border-slate-600" />}</button>)}</div>
        <InputField label="Other labour / subcontractors" value={form.otherStaffPresent} onChange={(event) => setForm({ ...form, otherStaffPresent: event.target.value })} />
      </Card>

      <Card className="space-y-4">
        <h2 className="flex items-center gap-2 font-semibold"><HardHat className="size-5 text-cyan-300" />Daily progress</h2>
        <InputField label="Weather snapshot" value={form.weather} onChange={(event) => setForm({ ...form, weather: event.target.value })} placeholder="Dry, 18°C, light wind" />
        <TextareaField label="Work completed" value={form.workCompleted} onChange={(event) => setForm({ ...form, workCompleted: event.target.value })} />
        <TextareaField label="Plant and equipment used" value={form.plantAndEquipment} onChange={(event) => setForm({ ...form, plantAndEquipment: event.target.value })} />
        <TextareaField label="Materials used" value={form.materialsUsed} onChange={(event) => setForm({ ...form, materialsUsed: event.target.value })} />
        <TextareaField label="Materials required" value={form.materialsRequired} onChange={(event) => setForm({ ...form, materialsRequired: event.target.value })} />
        <TextareaField label="Deliveries received" value={form.deliveriesReceived} onChange={(event) => setForm({ ...form, deliveriesReceived: event.target.value })} />
      </Card>

      <Card className="space-y-4">
        <h2 className="flex items-center gap-2 font-semibold"><ShieldAlert className="size-5 text-amber-300" />Instructions, delays and safety</h2>
        <TextareaField label="Delays" value={form.delays} onChange={(event) => setForm({ ...form, delays: event.target.value })} />
        <TextareaField label="Builder instructions" value={form.builderInstructions} onChange={(event) => setForm({ ...form, builderInstructions: event.target.value })} />
        <TextareaField label="Customer instructions" value={form.customerInstructions} onChange={(event) => setForm({ ...form, customerInstructions: event.target.value })} />
        <TextareaField label="H&S observations / issues" value={form.issuesAndRisks} onChange={(event) => setForm({ ...form, issuesAndRisks: event.target.value })} />
        <TextareaField label="Toolbox talks" value={form.toolboxTalks} onChange={(event) => setForm({ ...form, toolboxTalks: event.target.value })} />
        <TextareaField label="Follow-up actions" value={form.followUpActions} onChange={(event) => setForm({ ...form, followUpActions: event.target.value })} />
        <TextareaField label="Voice note transcript" value={form.voiceNoteTranscript} onChange={(event) => setForm({ ...form, voiceNoteTranscript: event.target.value })} />
      </Card>

      <Card className="space-y-4">
        <h2 className="flex items-center gap-2 font-semibold"><PackageCheck className="size-5 text-emerald-300" />Daily acknowledgement</h2>
        <InputField label="Engineer signature name" value={form.engineerSignatureName} onChange={(event) => setForm({ ...form, engineerSignatureName: event.target.value })} />
        <InputField label="Customer acknowledgement name" value={form.customerSignOffName} onChange={(event) => setForm({ ...form, customerSignOffName: event.target.value })} />
        <TextareaField label="Customer acknowledgement notes" value={form.customerSignOffNotes} onChange={(event) => setForm({ ...form, customerSignOffNotes: event.target.value })} />
        <p className="text-xs text-slate-400">Entering a name records the current timestamp when this diary is saved. Final job completion sign-off remains in Completion Packs.</p>
      </Card>

      <Button type="submit" className="min-h-14 w-full text-base">Save daily progress</Button>
    </form>

    {form.jobId ? <Link href={`/jobs/${form.jobId}`} className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-slate-700 px-4 text-sm font-semibold">Open full job</Link> : null}
  </div>;
}
