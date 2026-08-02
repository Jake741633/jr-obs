"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { Brain, CheckCircle2, Cloud, Download, ShieldCheck, Upload } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { defaultAiProfile, downloadJrOsBackup, importJrOsBackup, type JrAiProfile } from "../../lib/appData";
import { organisationStorageKey } from "../../lib/cloud/adapter";
import { useCloudIdentity } from "../../lib/cloud/useCloudIdentity";
import { getCloudReadiness } from "../../lib/cloudConfig";

const profileKey = "jr-os-ai-profile";
const fieldClass = "min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-white outline-none focus:border-cyan-400";

export default function SettingsPage() {
  const { identity, isReady: identityReady } = useCloudIdentity();
  const activeProfileKey = useMemo(
    () => identity?.organisationId ? organisationStorageKey(profileKey, identity.organisationId) : profileKey,
    [identity?.organisationId],
  );
  const [profile, setProfile] = useState<JrAiProfile>(defaultAiProfile);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const cloud = getCloudReadiness();

  useEffect(() => {
    if (!identityReady) return;
    setReady(false);
    try {
      const saved = window.localStorage.getItem(activeProfileKey);
      setProfile(saved ? { ...defaultAiProfile, ...(JSON.parse(saved) as Partial<JrAiProfile>) } : defaultAiProfile);
    } finally {
      setReady(true);
    }
  }, [activeProfileKey, identityReady]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(activeProfileKey, JSON.stringify({ ...profile, updatedAt: new Date().toISOString() }));
  }, [activeProfileKey, profile, ready]);

  async function restoreBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const count = await importJrOsBackup(file, identity?.organisationId);
      setMessage(`Restored ${count} JR OS data sections. Reloading…`);
      window.setTimeout(() => window.location.reload(), 800);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Backup could not be restored.");
    } finally {
      event.target.value = "";
    }
  }

  if (!identityReady || !ready) return <Card>Loading settings…</Card>;

  return <div className="space-y-6">
    <div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Business control</p><h1 className="mt-1 text-3xl font-bold">Settings</h1><p className="mt-2 text-sm text-slate-400">Control how JR AI remembers your working preferences and protect the data stored in JR OS.</p></div>

    <div className="grid gap-4 md:grid-cols-3">
      <Card><Brain className="size-6 text-cyan-300" /><p className="mt-3 font-bold">Personalised assistant</p><p className="mt-2 text-sm text-slate-400">Your approved preferences can guide future survey, quote and certificate drafts.</p></Card>
      <Card><ShieldCheck className="size-6 text-emerald-300" /><p className="mt-3 font-bold">Inspector remains in control</p><p className="mt-2 text-sm text-slate-400">AI suggestions remain drafts and technical decisions must be reviewed before issue.</p></Card>
      <Card><Cloud className={`size-6 ${cloud.configured ? "text-emerald-300" : "text-amber-300"}`} /><p className="mt-3 font-bold">{cloud.configured ? "Cloud keys detected" : "Cloud setup required"}</p><p className="mt-2 text-sm text-slate-400">{cloud.configured ? "JR OS has the environment settings needed for the next authentication and sync stage." : "Add the Supabase project URL and public anon key before account-based syncing is enabled."}</p></Card>
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
      <p className="mt-4 flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 className="size-4" />Changes save automatically for this organisation on this device.</p>
    </Card>

    <Card>
      <h2 className="text-xl font-bold">Cloud foundation status</h2>
      <p className="mt-2 text-sm text-slate-400">The database schema, security policies, file bucket plan and environment checks are now included in the repository.</p>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm"><strong className="block text-white">Supabase project URL</strong><span className={cloud.projectUrlPresent ? "text-emerald-300" : "text-amber-300"}>{cloud.projectUrlPresent ? "Detected" : "Not configured"}</span></div>
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm"><strong className="block text-white">Supabase public key</strong><span className={cloud.anonKeyPresent ? "text-emerald-300" : "text-amber-300"}>{cloud.anonKeyPresent ? "Detected" : "Not configured"}</span></div>
      </div>
      <p className="mt-4 text-sm text-slate-400">No local records will be deleted when cloud migration is added. The migration will copy records first, verify them, and keep a local recovery cache.</p>
    </Card>

    <Card>
      <h2 className="text-xl font-bold">Data protection and backup</h2>
      <p className="mt-2 text-sm text-slate-400">Download a backup for this organisation before changing browser, clearing website data or moving device. Restore it only into the matching organisation.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button onClick={() => { downloadJrOsBackup(identity?.organisationId); setMessage("Backup downloaded."); }}><Download className="mr-2 size-4" />Download backup</Button>
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-100 hover:bg-slate-800"><Upload className="mr-2 size-4" />Restore backup<input type="file" accept="application/json,.json" className="hidden" onChange={restoreBackup} /></label>
      </div>
      {message ? <p className="mt-4 text-sm text-cyan-300">{message}</p> : null}
      <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-100"><strong>Protected backup scope:</strong> active organisation business data only. Authentication sessions, sync queues, version markers and other organisations' caches are excluded.</div>
    </Card>
  </div>;
}
