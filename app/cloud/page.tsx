"use client";

import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Cloud, CloudDownload, CloudUpload, LogIn, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import {
  getCurrentCloudUser,
  migrateLocalDataToCloud,
  restoreCloudDataToLocal,
  signInWithEmail,
  signOutCloudUser,
  signUpWithEmail,
} from "../../lib/cloudSync";
import { isSupabaseConfigured } from "../../lib/supabase/client";

const fieldClass = "min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-white outline-none focus:border-cyan-400";

export default function CloudPage() {
  const configured = isSupabaseConfigured();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.localStorage.getItem("jr-os-last-cloud-sync"),
  );

  useEffect(() => {
    let active = true;
    void getCurrentCloudUser().then((user) => {
      if (active) setUserEmail(user?.email ?? null);
    });
    return () => {
      active = false;
    };
  }, []);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      await action();
      setMessage(success);
      const user = await getCurrentCloudUser();
      setUserEmail(user?.email ?? null);
      setLastSync(window.localStorage.getItem("jr-os-last-cloud-sync"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The action could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  function accountDetailsAreValid() {
    if (!email.trim()) {
      setMessage("Enter your email address.");
      return false;
    }
    if (password.length < 8) {
      setMessage("Your password must be at least 8 characters long.");
      return false;
    }
    return true;
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!accountDetailsAreValid()) return;
    await run(() => signInWithEmail(email.trim(), password), "Signed in securely.");
  }

  async function createAccount() {
    if (!accountDetailsAreValid()) return;
    await run(
      () => signUpWithEmail(email.trim(), password),
      "Account created. Check your email if confirmation is enabled.",
    );
  }

  return <div className="space-y-6">
    <div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Cloud foundation</p><h1 className="mt-1 text-3xl font-bold">Cloud & account</h1><p className="mt-2 text-sm text-slate-400">Connect JR OS to secure account-based storage without deleting your existing browser records.</p></div>

    <div className="grid gap-4 md:grid-cols-3">
      <Card><Cloud className="size-6 text-cyan-300" /><p className="mt-3 font-bold">Configuration</p><p className="mt-2 text-sm text-slate-400">{configured ? "Supabase environment values detected." : "Waiting for Supabase project URL and public anon key."}</p></Card>
      <Card><ShieldCheck className="size-6 text-emerald-300" /><p className="mt-3 font-bold">Safe migration</p><p className="mt-2 text-sm text-slate-400">Local data is copied to the cloud first. It is not automatically erased.</p></Card>
      <Card><CheckCircle2 className="size-6 text-amber-300" /><p className="mt-3 font-bold">Last successful upload</p><p className="mt-2 text-sm text-slate-400">{lastSync ? new Date(lastSync).toLocaleString("en-GB") : "No cloud upload completed yet."}</p></Card>
    </div>

    {!configured ? <Card className="border-amber-500/30"><h2 className="text-xl font-bold">Connection required</h2><p className="mt-2 text-sm text-slate-400">Create the Supabase project, run the supplied database schema and add NEXT_PUBLIC_SUPABASE_URL plus NEXT_PUBLIC_SUPABASE_ANON_KEY to the deployment environment. Local storage and backup downloads continue working meanwhile.</p></Card> : null}

    <Card>
      <h2 className="text-xl font-bold">JR OS account</h2>
      {userEmail ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4"><div><p className="font-semibold text-emerald-200">Signed in</p><p className="text-sm text-slate-400">{userEmail}</p></div><Button disabled={busy} onClick={() => run(signOutCloudUser, "Signed out.")}><LogOut className="mr-2 size-4" />Sign out</Button></div> : <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={signIn}><label className="grid gap-2 text-sm">Email<input type="email" autoComplete="email" required className={fieldClass} value={email} onChange={(event) => setEmail(event.target.value)} /></label><label className="grid gap-2 text-sm">Password<input type="password" autoComplete="current-password" minLength={8} required className={fieldClass} value={password} onChange={(event) => setPassword(event.target.value)} /></label><div className="flex flex-wrap gap-3 md:col-span-2"><Button disabled={busy || !configured} type="submit"><LogIn className="mr-2 size-4" />Sign in</Button><Button disabled={busy || !configured} type="button" onClick={createAccount}>Create account</Button></div></form>}
    </Card>

    <Card>
      <h2 className="text-xl font-bold">Data migration controls</h2><p className="mt-2 text-sm text-slate-400">Download a normal backup first, then copy each JR OS data section into your secured cloud account. Restoring from cloud writes a copy back to this browser.</p>
      <div className="mt-5 flex flex-wrap gap-3"><Button disabled={busy || !configured || !userEmail} onClick={() => run(async () => { const result = await migrateLocalDataToCloud(); if (result.errors.length) throw new Error(`${result.uploaded} uploaded; ${result.errors.length} failed. ${result.errors[0]}`); }, "All local JR OS sections were copied to cloud storage.")}><CloudUpload className="mr-2 size-4" />Copy local data to cloud</Button><Button disabled={busy || !configured || !userEmail} onClick={() => run(async () => { const count = await restoreCloudDataToLocal(); setMessage(`Restored ${count} cloud sections to this browser. Reload JR OS to see them.`); }, "Cloud data restored.")}><CloudDownload className="mr-2 size-4" />Restore cloud data</Button></div>
      {message ? <p className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-cyan-200">{message}</p> : null}
    </Card>
  </div>;
}
