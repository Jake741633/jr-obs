"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { Brain, CheckCircle2, Cloud, Download, ShieldCheck, Upload } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { defaultAiProfile, downloadJrOsBackup, importJrOsBackup, type JrAiProfile } from "../../lib/appData";

const profileKey = "jr-os-ai-profile";
const fieldClass = "min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-white outline-none focus:border-cyan-400";

export default function SettingsPage() {
  const [profile, setProfile] = useState<JrAiProfile>(defaultAiProfile);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(profileKey);
      if (saved) setProfile({ ...defaultAiProfile, ...(JSON.parse(saved) as Partial<JrAiProfile>) });
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(profileKey, JSON.stringify({ ...profile, updatedAt: new Date().toISOString() }));
  }, [profile, ready]);

  async function restoreBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const count = await importJrOsBackup(file);
      setMessage(`Restored ${count} JR OS data sections. Reloading…`);
      window.setTimeout(() => window.location.reload(), 800);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Backup could not be restored.");
    } finally {
      event.target.value = "";
    }
  }

  if (!ready) return <Card>Loading settings…</Card>;

  return <div className="space-y-6">
    <div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Business control</p><h1 className="mt-1 text-3xl font-bold">Settings</h1><p className="mt-2 text-sm text-slate-400">Control how JR AI remembers your working preferences and protect the data stored in JR OS.</p></div>

    <div className="grid gap-4 md:grid-cols-3">
      <Card><Brain className="size-6 text-cyan-300" /><p className="mt-3 font-bold">Personalised assistant</p><p className="mt-2 text-sm text-slate-400">Your approved preferences can guide future survey, quote and certificate drafts.</p></Card>
      <Card><ShieldCheck className="size-6 text-emerald-300" /><p className="mt-3 font-bold">Inspector remains in control</p><p className="mt-2 text-sm text-slate-400">AI suggestions remain drafts and technical decisions must be reviewed before issue.</p></Card>
      <Card><Cloud className="size-6 text-amber-300" /><p className="mt-3 font-bold">Cloud sync is next</p><p className="mt-2 text-sm text-slate-400">The current build saves to this browser. Account-based cloud storage will make it available across devices.</p></Card>
    </div>

    <Card className="border-cyan-400/30">
      <div className="flex items-center gap-3"><Brain className="size-6 text-cyan-300" /><div><h2 className="text-xl font-bold">JR AI working profile</h2><p className="text-sm text-slate-400">Editable memory that JR AI can use when producing drafts.</p></div></div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm">Owner name<input className={fieldClass} value={profile.ownerName} onChange={(event) => setProfile({ ...profile, ownerName: event.target.value })} /></label>
        <label className="grid gap-2 text-sm">Business name<input className={fieldClass} value={profile.businessName} onChange={(event) => setProfile({ ...profile, businessName: event.target.value })} /></label>
        <label className="grid gap-2 text-sm">Default labour rate (£)<input type="number" min="0" step="0.01" className={fieldClass} value={profile.defaultLabourRate} onChange={(event) => setProfile({ ...profile, defaultLabourRate: Number(event.target.value) })} /></label>
        <label className="grid gap-2 text-sm">Certificate inspector<input className={fieldClass} value={profile.preferredCertificateInspector} onChange={(event) => setProfile({ ...profile, preferredCertificateInspector: event.target.value })} /></label>
        <label className="grid gap-2 text-sm">Preferred suppliers<input className={fieldClass} value={profile.preferredSuppliers.join(", ")} onChange={(event) => setProfile({ ...profile, preferredSuppliers: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></label>
        <label className="grid gap-2 text-sm">Quote style<select className={fieldClass} value={profile.quoteStyle} onChange={(event) => setProfile({ ...profile, quoteStyle: event.target.value as JrAiProfile["quoteStyle"] })}><option>Detailed</option><option>Balanced</option><option>Simple</option></select></label>
        <label className="grid gap-2 text-sm">Risk approach<select className={fieldClass} value={profile.riskPreference} onChange={(event) => setProfile({ ...profile, riskPreference: event.target.value as JrAiProfile["riskPreference"] })}><option>Cautious</option><option>Balanced</option></select></label>
        <label className="flex items-center gap-3 rounded-xl border border-slate-700 p-4 text-sm"><input type="checkbox" checked={profile.learningEnabled} onChange={(event) => setProfile({ ...profile, learningEnabled: event.target.checked })} /><span><strong className="block">Allow approved preferences to improve future drafts</strong><span className="text-slate-400">This stores your confirmed choices, not automatic technical decisions.</span></span></label>
        <label className="grid gap-2 text-sm md:col-span-2">Working preferences and notes<textarea className={`${fieldClass} min-h-28 py-3`} placeholder="For example: keep building work excluded, use cautious wording, prefer CEF materials…" value={profile.notes} onChange={(event) => setProfile({ ...profile, notes: event.target.value })} /></label>
      </div>
      <p className="mt-4 flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 className="size-4" />Changes save automatically on this device.</p>
    </Card>

    <Card>
      <h2 className="text-xl font-bold">Data protection and backup</h2>
      <p className="mt-2 text-sm text-slate-400">Download a complete backup before changing browser, clearing website data or moving device. Restore it here at any time.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button onClick={() => { downloadJrOsBackup(); setMessage("Backup downloaded."); }}><Download className="mr-2 size-4" />Download backup</Button>
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-100 hover:bg-slate-800"><Upload className="mr-2 size-4" />Restore backup<input type="file" accept="application/json,.json" className="hidden" onChange={restoreBackup} /></label>
      </div>
      {message ? <p className="mt-4 text-sm text-cyan-300">{message}</p> : null}
      <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-100"><strong>Current storage:</strong> browser local storage. It survives normal closing and reopening, but it is not yet a secure cloud database and does not automatically sync between your phone and laptop.</div>
    </Card>
  </div>;
}
