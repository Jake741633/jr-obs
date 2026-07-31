"use client";

import { FormEvent, useMemo, useState } from "react";
import { AlertTriangle, Clock3, Plus, ShieldCheck, Trash2, UserRound, Users } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { InputField, TextareaField } from "../../components/ui/FormField";
import { PageHeader } from "../../components/ui/PageHeader";
import { useTeamCollection } from "../../lib/cloud/coreBusinessCollections";
import { makeId, useCloudLocalCollection } from "../../lib/storage";
import type { Job, TeamMember, TeamMemberStatus, TeamQualification, TeamRole, TimesheetEntry, TimesheetStatus } from "../../lib/models";

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const roles: TeamRole[] = ["Owner", "Electrician", "Electrician's mate", "Apprentice", "Office", "Subcontractor"];
const memberStatuses: TeamMemberStatus[] = ["Active", "On leave", "Inactive"];
const timesheetStatuses: TimesheetStatus[] = ["Draft", "Submitted", "Approved"];
const blankMember = { name: "", role: "Electrician" as TeamRole, status: "Active" as TeamMemberStatus, email: "", phone: "", emergencyContact: "", emergencyPhone: "", hourlyCost: "0", chargeRate: "0", vanRegistration: "", notes: "" };
const blankQualification = { teamMemberId: "", name: "", certificateNumber: "", issuedAt: "", expiresAt: "", notes: "" };
const blankTimesheet = { teamMemberId: "", jobId: "", workDate: "", startedAt: "", finishedAt: "", breakMinutes: "0", notes: "", status: "Draft" as TimesheetStatus };
const DAY_MS = 24 * 60 * 60 * 1000;

function dateKey(value: string) {
  const [year = 0, month = 0, day = 0] = value.split("-").map(Number);
  return year * 372 + month * 31 + day;
}

function formatDate(value: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function minutesFromTime(value: string) {
  const [hours = 0, minutes = 0] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function hoursFor(entry: TimesheetEntry) {
  if (!entry.startedAt || !entry.finishedAt) return 0;
  const workedMinutes = minutesFromTime(entry.finishedAt) - minutesFromTime(entry.startedAt) - entry.breakMinutes;
  return Math.max(0, workedMinutes / 60);
}

export default function TeamPage() {
  const team = useTeamCollection();
  const timesheets = useCloudLocalCollection<TimesheetEntry>("jr-os-timesheets");
  const jobs = useCloudLocalCollection<Job>("jr-os-jobs");
  const [memberForm, setMemberForm] = useState(blankMember);
  const [qualificationForm, setQualificationForm] = useState(blankQualification);
  const [timesheetForm, setTimesheetForm] = useState(blankTimesheet);
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [showQualificationForm, setShowQualificationForm] = useState(false);
  const [showTimesheetForm, setShowTimesheetForm] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [message, setMessage] = useState("");
  const [warningWindow] = useState(() => {
    const today = new Date();
    const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    return { todayKey: dateKey(todayValue), limitKey: dateKey(new Date(today.getTime() + 60 * DAY_MS).toISOString().slice(0, 10)) };
  });

  const activeMembers = useMemo(() => team.items.filter((member) => member.status === "Active"), [team.items]);
  const visibleTimesheets = useMemo(() => timesheets.items.filter((entry) => !selectedMemberId || entry.teamMemberId === selectedMemberId).toSorted((a, b) => b.workDate.localeCompare(a.workDate)), [timesheets.items, selectedMemberId]);
  const expiringQualifications = useMemo(() => team.items
    .flatMap((member) => member.qualifications.map((qualification) => ({ member, qualification })))
    .filter(({ qualification }) => {
      if (!qualification.expiresAt) return false;
      const expiryKey = dateKey(qualification.expiresAt);
      return expiryKey >= warningWindow.todayKey && expiryKey <= warningWindow.limitKey;
    }), [team.items, warningWindow]);
  const approvedHours = visibleTimesheets.filter((entry) => entry.status === "Approved").reduce((sum, entry) => sum + hoursFor(entry), 0);
  const approvedLabourCost = visibleTimesheets.filter((entry) => entry.status === "Approved").reduce((sum, entry) => {
    const member = team.items.find((item) => item.id === entry.teamMemberId);
    return sum + hoursFor(entry) * (member?.hourlyCost || 0);
  }, 0);

  function memberName(id: string) { return team.items.find((member) => member.id === id)?.name || "Unknown team member"; }
  function jobName(id?: string) { return jobs.items.find((job) => job.id === id)?.title || "General / office"; }

  function addMember(event: FormEvent) {
    event.preventDefault();
    if (!memberForm.name.trim()) { setMessage("Enter the team member's name."); return; }
    const now = new Date().toISOString();
    const member: TeamMember = {
      id: makeId("team"), name: memberForm.name.trim(), role: memberForm.role, status: memberForm.status,
      email: memberForm.email.trim(), phone: memberForm.phone.trim(), emergencyContact: memberForm.emergencyContact.trim(), emergencyPhone: memberForm.emergencyPhone.trim(),
      hourlyCost: Number(memberForm.hourlyCost || 0), chargeRate: Number(memberForm.chargeRate || 0), vanRegistration: memberForm.vanRegistration.trim().toUpperCase(), qualifications: [], notes: memberForm.notes.trim(), createdAt: now, updatedAt: now,
    };
    team.setItems((current) => [member, ...current]);
    setMemberForm(blankMember); setShowMemberForm(false); setMessage(`${member.name} added to the team.`);
  }

  function addQualification(event: FormEvent) {
    event.preventDefault();
    if (!qualificationForm.teamMemberId || !qualificationForm.name.trim()) { setMessage("Choose a team member and enter the qualification."); return; }
    const qualification: TeamQualification = { id: makeId("qualification"), name: qualificationForm.name.trim(), certificateNumber: qualificationForm.certificateNumber.trim(), issuedAt: qualificationForm.issuedAt, expiresAt: qualificationForm.expiresAt, notes: qualificationForm.notes.trim() };
    team.setItems((current) => current.map((member) => member.id === qualificationForm.teamMemberId ? { ...member, qualifications: [...member.qualifications, qualification], updatedAt: new Date().toISOString() } : member));
    setQualificationForm({ ...blankQualification, teamMemberId: selectedMemberId || qualificationForm.teamMemberId }); setShowQualificationForm(false); setMessage("Qualification saved.");
  }

  function addTimesheet(event: FormEvent) {
    event.preventDefault();
    if (!timesheetForm.teamMemberId || !timesheetForm.workDate) { setMessage("Choose a team member and work date."); return; }
    const now = new Date().toISOString();
    const entry: TimesheetEntry = { id: makeId("timesheet"), teamMemberId: timesheetForm.teamMemberId, jobId: timesheetForm.jobId || undefined, workDate: timesheetForm.workDate, startedAt: timesheetForm.startedAt, finishedAt: timesheetForm.finishedAt, breakMinutes: Number(timesheetForm.breakMinutes || 0), notes: timesheetForm.notes.trim(), status: timesheetForm.status, createdAt: now, updatedAt: now };
    timesheets.setItems((current) => [entry, ...current]);
    setTimesheetForm({ ...blankTimesheet, teamMemberId: selectedMemberId || timesheetForm.teamMemberId }); setShowTimesheetForm(false); setMessage("Timesheet entry saved.");
  }

  function updateTimesheetStatus(id: string, status: TimesheetStatus) {
    timesheets.setItems((current) => current.map((entry) => entry.id === id ? { ...entry, status, updatedAt: new Date().toISOString() } : entry));
  }

  if (!team.isReady || !timesheets.isReady || !jobs.isReady) return <Card>Loading workforce…</Card>;

  return <div className="space-y-6">
    <PageHeader eyebrow="Operations" title="Team & Timesheets" description="Manage electricians, labour costs, qualifications, emergency contacts and job timesheets." />

    <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
      <select value={selectedMemberId} onChange={(event) => { setSelectedMemberId(event.target.value); setQualificationForm((current) => ({ ...current, teamMemberId: event.target.value })); setTimesheetForm((current) => ({ ...current, teamMemberId: event.target.value })); }} className="min-h-11 rounded-xl border border-slate-800 bg-slate-900 px-4 text-sm"><option value="">All team members</option>{team.items.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select>
      <Button onClick={() => setShowMemberForm((current) => !current)}><Plus className="mr-2 size-4" />Add member</Button>
      <Button variant="secondary" onClick={() => setShowQualificationForm((current) => !current)}><ShieldCheck className="mr-2 size-4" />Qualification</Button>
      <Button variant="secondary" onClick={() => setShowTimesheetForm((current) => !current)}><Clock3 className="mr-2 size-4" />Timesheet</Button>
    </div>

    {message ? <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card><Users className="size-5 text-cyan-300" /><p className="mt-3 text-sm text-slate-400">Active team</p><p className="mt-2 text-3xl font-bold">{activeMembers.length}</p></Card>
      <Card><Clock3 className="size-5 text-emerald-300" /><p className="mt-3 text-sm text-slate-400">Approved hours</p><p className="mt-2 text-3xl font-bold">{approvedHours.toFixed(1)}h</p></Card>
      <Card><UserRound className="size-5 text-violet-300" /><p className="mt-3 text-sm text-slate-400">Labour cost</p><p className="mt-2 text-3xl font-bold">{money.format(approvedLabourCost)}</p></Card>
      <Card><AlertTriangle className="size-5 text-amber-300" /><p className="mt-3 text-sm text-slate-400">Qualifications due</p><p className="mt-2 text-3xl font-bold">{expiringQualifications.length}</p></Card>
    </section>

    {showMemberForm ? <Card><form onSubmit={addMember} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><InputField required label="Name" value={memberForm.name} onChange={(event) => setMemberForm({ ...memberForm, name: event.target.value })} /><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Role</span><select value={memberForm.role} onChange={(event) => setMemberForm({ ...memberForm, role: event.target.value as TeamRole })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{roles.map((role) => <option key={role}>{role}</option>)}</select></label><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Status</span><select value={memberForm.status} onChange={(event) => setMemberForm({ ...memberForm, status: event.target.value as TeamMemberStatus })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{memberStatuses.map((status) => <option key={status}>{status}</option>)}</select></label><InputField label="Email" type="email" value={memberForm.email} onChange={(event) => setMemberForm({ ...memberForm, email: event.target.value })} /><InputField label="Phone" value={memberForm.phone} onChange={(event) => setMemberForm({ ...memberForm, phone: event.target.value })} /><InputField label="Van registration" value={memberForm.vanRegistration} onChange={(event) => setMemberForm({ ...memberForm, vanRegistration: event.target.value })} /><InputField label="Hourly employment cost (£)" type="number" min="0" step="0.01" value={memberForm.hourlyCost} onChange={(event) => setMemberForm({ ...memberForm, hourlyCost: event.target.value })} /><InputField label="Charge rate (£)" type="number" min="0" step="0.01" value={memberForm.chargeRate} onChange={(event) => setMemberForm({ ...memberForm, chargeRate: event.target.value })} /><div /><InputField label="Emergency contact" value={memberForm.emergencyContact} onChange={(event) => setMemberForm({ ...memberForm, emergencyContact: event.target.value })} /><InputField label="Emergency phone" value={memberForm.emergencyPhone} onChange={(event) => setMemberForm({ ...memberForm, emergencyPhone: event.target.value })} /><div className="md:col-span-2 xl:col-span-3"><TextareaField label="Notes" value={memberForm.notes} onChange={(event) => setMemberForm({ ...memberForm, notes: event.target.value })} /></div><div className="md:col-span-2 xl:col-span-3 flex justify-end"><Button type="submit">Save team member</Button></div></form></Card> : null}

    {showQualificationForm ? <Card><form onSubmit={addQualification} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Team member</span><select value={qualificationForm.teamMemberId} onChange={(event) => setQualificationForm({ ...qualificationForm, teamMemberId: event.target.value })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">Choose member</option>{team.items.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label><InputField required label="Qualification" placeholder="ECS Gold Card, 18th Edition, IPAF…" value={qualificationForm.name} onChange={(event) => setQualificationForm({ ...qualificationForm, name: event.target.value })} /><InputField label="Certificate / card number" value={qualificationForm.certificateNumber} onChange={(event) => setQualificationForm({ ...qualificationForm, certificateNumber: event.target.value })} /><InputField label="Issued date" type="date" value={qualificationForm.issuedAt} onChange={(event) => setQualificationForm({ ...qualificationForm, issuedAt: event.target.value })} /><InputField label="Expiry date" type="date" value={qualificationForm.expiresAt} onChange={(event) => setQualificationForm({ ...qualificationForm, expiresAt: event.target.value })} /><div className="xl:col-span-3"><TextareaField label="Notes" value={qualificationForm.notes} onChange={(event) => setQualificationForm({ ...qualificationForm, notes: event.target.value })} /></div><div className="xl:col-span-3 flex justify-end"><Button type="submit">Save qualification</Button></div></form></Card> : null}

    {showTimesheetForm ? <Card><form onSubmit={addTimesheet} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Team member</span><select value={timesheetForm.teamMemberId} onChange={(event) => setTimesheetForm({ ...timesheetForm, teamMemberId: event.target.value })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">Choose member</option>{activeMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Job</span><select value={timesheetForm.jobId} onChange={(event) => setTimesheetForm({ ...timesheetForm, jobId: event.target.value })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">General / office</option>{jobs.items.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label><InputField required label="Work date" type="date" value={timesheetForm.workDate} onChange={(event) => setTimesheetForm({ ...timesheetForm, workDate: event.target.value })} /><InputField label="Started" type="time" value={timesheetForm.startedAt} onChange={(event) => setTimesheetForm({ ...timesheetForm, startedAt: event.target.value })} /><InputField label="Finished" type="time" value={timesheetForm.finishedAt} onChange={(event) => setTimesheetForm({ ...timesheetForm, finishedAt: event.target.value })} /><InputField label="Break minutes" type="number" min="0" value={timesheetForm.breakMinutes} onChange={(event) => setTimesheetForm({ ...timesheetForm, breakMinutes: event.target.value })} /><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Status</span><select value={timesheetForm.status} onChange={(event) => setTimesheetForm({ ...timesheetForm, status: event.target.value as TimesheetStatus })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{timesheetStatuses.map((status) => <option key={status}>{status}</option>)}</select></label><div className="md:col-span-2 xl:col-span-3"><TextareaField label="Notes" value={timesheetForm.notes} onChange={(event) => setTimesheetForm({ ...timesheetForm, notes: event.target.value })} /></div><div className="md:col-span-2 xl:col-span-3 flex justify-end"><Button type="submit">Save timesheet</Button></div></form></Card> : null}

    {expiringQualifications.length ? <section className="space-y-3"><h2 className="text-xl font-bold">Qualification warnings</h2>{expiringQualifications.map(({ member, qualification }) => <Card key={`${member.id}-${qualification.id}`} className="border-amber-500/30"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 size-5 text-amber-300" /><div><p className="font-semibold">{member.name} · {qualification.name}</p><p className="mt-1 text-sm text-slate-400">{qualification.expiresAt ? `Expires ${formatDate(qualification.expiresAt)}` : "No expiry date recorded"}{qualification.certificateNumber ? ` · ${qualification.certificateNumber}` : ""}</p></div></div></Card>)}</section> : null}

    <section className="grid gap-6 xl:grid-cols-2">
      <div className="space-y-3"><h2 className="text-xl font-bold">Team</h2>{team.items.length === 0 ? <Card><p className="text-sm text-slate-400">No team members have been added yet.</p></Card> : team.items.map((member) => <Card key={member.id}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{member.role}</p><h3 className="mt-1 text-lg font-bold">{member.name}</h3><p className="text-sm text-slate-500">{member.status}{member.vanRegistration ? ` · ${member.vanRegistration}` : ""}</p></div><button onClick={() => team.remove((item) => item.id === member.id)} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300" aria-label={`Delete ${member.name}`}><Trash2 className="size-4" /></button></div><div className="mt-4 grid gap-2 text-sm text-slate-400 sm:grid-cols-2"><p>Cost: <span className="font-semibold text-slate-200">{money.format(member.hourlyCost)}/h</span></p><p>Charge: <span className="font-semibold text-slate-200">{money.format(member.chargeRate)}/h</span></p><p>{member.phone || "No phone"}</p><p>{member.email || "No email"}</p></div><div className="mt-4 border-t border-slate-800 pt-4"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Qualifications</p>{member.qualifications.length === 0 ? <p className="mt-2 text-sm text-slate-500">None recorded.</p> : <div className="mt-2 flex flex-wrap gap-2">{member.qualifications.map((qualification) => <span key={qualification.id} className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-300">{qualification.name}{qualification.expiresAt ? ` · ${formatDate(qualification.expiresAt)}` : ""}</span>)}</div>}</div></Card>)}</div>

      <div className="space-y-3"><h2 className="text-xl font-bold">Timesheets</h2>{visibleTimesheets.length === 0 ? <Card><p className="text-sm text-slate-400">No timesheet entries for this selection.</p></Card> : visibleTimesheets.map((entry) => <Card key={entry.id}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{memberName(entry.teamMemberId)}</p><h3 className="mt-1 font-bold">{formatDate(entry.workDate)}</h3><p className="text-sm text-slate-500">{jobName(entry.jobId)} · {hoursFor(entry).toFixed(1)}h</p></div><button onClick={() => timesheets.remove((item) => item.id === entry.id)} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300" aria-label="Delete timesheet"><Trash2 className="size-4" /></button></div>{entry.notes ? <p className="mt-3 whitespace-pre-wrap text-sm text-slate-300">{entry.notes}</p> : null}<div className="mt-4 flex items-center gap-3 border-t border-slate-800 pt-4"><span className="text-xs text-slate-500">Status</span><select value={entry.status} onChange={(event) => updateTimesheetStatus(entry.id, event.target.value as TimesheetStatus)} className="min-h-10 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm">{timesheetStatuses.map((status) => <option key={status}>{status}</option>)}</select></div></Card>)}</div>
    </section>
  </div>;
}
