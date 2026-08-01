"use client";

import { FormEvent, MouseEvent, useEffect, useState } from "react";
import { CheckCircle2, Cloud, CloudDownload, CloudOff, CloudUpload, LogIn, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import {
  getCurrentCloudUser,
  migrateLocalDataToCloud,
  migrateTypedLocalDataToCloud,
  restoreCloudDataToLocal,
  signInWithEmail,
  signOutCloudUser,
  signUpWithEmail,
  type TypedMigrationProgress,
} from "../../lib/cloudSync";
import { effectiveCloudMode } from "../../lib/cloud/config";
import { flushSyncQueue, syncStatus, type SyncState } from "../../lib/cloud/repository";
import { isSupabaseConfigured } from "../../lib/supabase/client";

const fieldClass = "min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-white outline-none focus:border-cyan-400";
type MigrationAction = "typed-import" | "legacy-copy" | "legacy-restore" | "retry-queue";
const emptyResults: Record<MigrationAction, string> = { "typed-import": "", "legacy-copy": "", "legacy-restore": "", "retry-queue": "" };

export default function CloudPage() {
  const configured = isSupabaseConfigured();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [accountMessage, setAccountMessage] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);
  const [activeAction, setActiveAction] = useState<MigrationAction | null>(null);
  const [actionResults, setActionResults] = useState<Record<MigrationAction, string>>(emptyResults);
  const [importProgress, setImportProgress] = useState<TypedMigrationProgress | null>(null);
  const [sync, setSync] = useState<SyncState>(() => typeof window === "undefined" ? "Offline" : syncStatus.get());
  const [lastSync, setLastSync] = useState<string | null>(() => typeof window === "undefined" ? null : window.localStorage.getItem("jr-os-last-cloud-sync"));

  useEffect(() => {
    let active = true;
    void getCurrentCloudUser().then((user) => { if (active) setUserEmail(user?.email ?? null); });
    const listener = (event: Event) => setSync((event as CustomEvent<SyncState>).detail);
    window.addEventListener("jr-os-sync-status", listener);
    return () => { active = false; window.removeEventListener("jr-os-sync-status", listener); };
  }, []);

  async function runAccountAction(action: () => Promise<unknown>, success: string) {
    setAccountBusy(true);
    setAccountMessage("");
    try {
      await action();
      setAccountMessage(success);
      const user = await getCurrentCloudUser();
      setUserEmail(user?.email ?? null);
      setLastSync(window.localStorage.getItem("jr-os-last-cloud-sync"));
      setSync(syncStatus.get());
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : "The account action could not be completed.");
    } finally {
      setAccountBusy(false);
    }
  }

  async function runMigrationAction(action: MigrationAction, operation: () => Promise<string>) {
    setActiveAction(action);
    setActionResults((current) => ({ ...current, [action]: "" }));
    try {
      const result = await operation();
      setActionResults((current) => ({ ...current, [action]: result }));
      setLastSync(window.localStorage.getItem("jr-os-last-cloud-sync"));
    } catch (error) {
      setActionResults((current) => ({ ...current, [action]: error instanceof Error ? error.message : "The migration action could not be completed." }));
    } finally {
      setActiveAction(null);
    }
  }

  function accountDetailsAreValid() {
    if (!email.trim()) { setAccountMessage("Enter your email address."); return false; }
    if (password.length < 8) { setAccountMessage("Your password must be at least 8 characters long."); return false; }
    return true;
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!accountDetailsAreValid()) return;
    await runAccountAction(() => signInWithEmail(email.trim(), password), "Signed in securely.");
  }

  async function createAccount() {
    if (!accountDetailsAreValid()) return;
    await runAccountAction(() => signUpWithEmail(email.trim(), password), "Account created. Check your email if confirmation is enabled.");
  }

  function importTypedRecords(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    setImportProgress({ currentCollection: "Preparing collections", completedCollections: 0, totalCollections: 0, imported: 0, skipped: 0, failed: 0 });
    void runMigrationAction("typed-import", async () => {
      const result = await migrateTypedLocalDataToCloud(setImportProgress);
      const summary = `${result.uploaded} imported; ${result.skipped} skipped; ${result.errors.length} failed.`;
      if (result.errors.length) throw new Error(`${summary}\n${result.errors.join("\n")}`);
      return `Typed cloud import complete. ${summary} Local browser data was retained.`;
    });
  }

  function copyLegacyBackup(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    void runMigrationAction("legacy-copy", async () => {
      const result = await migrateLocalDataToCloud();
      const summary = `${result.uploaded} uploaded; ${result.skipped} skipped; ${result.errors.length} failed.`;
      if (result.errors.length) throw new Error(`${summary}\n${result.errors.join("\n")}`);
      return `Legacy backup copy complete. ${summary}`;
    });
  }

  function restoreLegacyBackup(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    void runMigrationAction("legacy-restore", async () => {
      const count = await restoreCloudDataToLocal();
      return `Legacy backup restore complete. Restored ${count} cloud sections to this browser. Reload JR OS to see them.`;
    });
  }

  function retryPendingChanges(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    void runMigrationAction("retry-queue", async () => {
      await flushSyncQueue();
      return `Pending-change retry complete. Queue status: ${syncStatus.get()}.`;
    });
  }

  const unavailable = !configured || !userEmail;

  return <div className="space-y-6">
    <div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Cloud foundation</p><h1 className="mt-1 text-3xl font-bold">Cloud & account</h1><p className="mt-2 text-sm text-slate-400">Connect JR OS to account-based storage without deleting or disabling existing browser records.</p></div>
    <div className="grid gap-4 md:grid-cols-4">
      <Card><Cloud className="size-6 text-cyan-300" /><p className="mt-3 font-bold">Configuration</p><p className="mt-2 text-sm text-slate-400">{configured ? "Supabase environment values detected." : "Waiting for Supabase project URL and public anon key."}</p></Card>
      <Card><ShieldCheck className="size-6 text-emerald-300" /><p className="mt-3 font-bold">Operating mode</p><p className="mt-2 text-sm capitalize text-slate-400">{effectiveCloudMode()}</p></Card>
      <Card>{sync === "Offline" ? <CloudOff className="size-6 text-amber-300" /> : <RefreshCw className="size-6 text-cyan-300" />}<p className="mt-3 font-bold">Sync status</p><p className="mt-2 text-sm text-slate-400">{sync}</p></Card>
      <Card><CheckCircle2 className="size-6 text-amber-300" /><p className="mt-3 font-bold">Last successful upload</p><p className="mt-2 text-sm text-slate-400">{lastSync ? new Date(lastSync).toLocaleString("en-GB") : "No cloud upload completed yet."}</p></Card>
    </div>
    {!configured ? <Card className="border-amber-500/30"><h2 className="text-xl font-bold">Connection required</h2><p className="mt-2 text-sm text-slate-400">Run both SQL files and add NEXT_PUBLIC_SUPABASE_URL plus NEXT_PUBLIC_SUPABASE_ANON_KEY. Local storage continues working meanwhile.</p></Card> : null}
    <Card><h2 className="text-xl font-bold">JR OS account</h2>{userEmail ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4"><div><p className="font-semibold text-emerald-200">Signed in</p><p className="text-sm text-slate-400">{userEmail}</p></div><Button type="button" disabled={accountBusy} onClick={() => void runAccountAction(signOutCloudUser, "Signed out.")}><LogOut className="mr-2 size-4" />Sign out</Button></div> : <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={signIn}><label className="grid gap-2 text-sm">Email<input type="email" autoComplete="email" required className={fieldClass} value={email} onChange={(event) => setEmail(event.target.value)} /></label><label className="grid gap-2 text-sm">Password<input type="password" autoComplete="current-password" minLength={8} required className={fieldClass} value={password} onChange={(event) => setPassword(event.target.value)} /></label><div className="flex flex-wrap gap-3 md:col-span-2"><Button disabled={accountBusy || !configured} type="submit"><LogIn className="mr-2 size-4" />Sign in</Button><Button disabled={accountBusy || !configured} type="button" onClick={() => void createAccount()}>Create account</Button></div></form>}{accountMessage ? <p className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-cyan-200">{accountMessage}</p> : null}</Card>
    <Card>
      <h2 className="text-xl font-bold">Data migration controls</h2>
      <p className="mt-2 text-sm text-slate-400">The legacy backup copy remains available. The typed migration copies individual records using their existing local IDs and skips unchanged records.</p>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 p-4">
          <Button type="button" disabled={unavailable || activeAction === "typed-import"} onClick={importTypedRecords}><CloudUpload className="mr-2 size-4" />{activeAction === "typed-import" ? "Importing typed records…" : "Import records to typed tables"}</Button>
          {importProgress ? <div className="mt-3 space-y-1 text-sm text-slate-400"><p>Current collection: <span className="text-slate-200">{importProgress.currentCollection}</span></p><p>Collections: {importProgress.completedCollections}/{importProgress.totalCollections || "…"}</p><p>{importProgress.imported} imported · {importProgress.skipped} skipped · {importProgress.failed} failed</p>{importProgress.latestError ? <p className="whitespace-pre-wrap text-red-300">{importProgress.latestError}</p> : null}</div> : null}
          {actionResults["typed-import"] ? <p className="mt-3 whitespace-pre-wrap rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-cyan-200">{actionResults["typed-import"]}</p> : null}
        </div>
        <div className="rounded-xl border border-slate-800 p-4">
          <Button type="button" disabled={unavailable || activeAction === "legacy-copy"} onClick={copyLegacyBackup}><CloudUpload className="mr-2 size-4" />{activeAction === "legacy-copy" ? "Copying legacy backup…" : "Copy legacy backup"}</Button>
          {actionResults["legacy-copy"] ? <p className="mt-3 whitespace-pre-wrap rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-cyan-200">{actionResults["legacy-copy"]}</p> : null}
        </div>
        <div className="rounded-xl border border-slate-800 p-4">
          <Button type="button" disabled={unavailable || activeAction === "legacy-restore"} onClick={restoreLegacyBackup}><CloudDownload className="mr-2 size-4" />{activeAction === "legacy-restore" ? "Restoring legacy backup…" : "Restore legacy backup"}</Button>
          {actionResults["legacy-restore"] ? <p className="mt-3 whitespace-pre-wrap rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-cyan-200">{actionResults["legacy-restore"]}</p> : null}
        </div>
        <div className="rounded-xl border border-slate-800 p-4">
          <Button type="button" disabled={unavailable || activeAction === "retry-queue"} onClick={retryPendingChanges}><RefreshCw className="mr-2 size-4" />{activeAction === "retry-queue" ? "Retrying pending changes…" : "Retry pending changes"}</Button>
          {actionResults["retry-queue"] ? <p className="mt-3 whitespace-pre-wrap rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-cyan-200">{actionResults["retry-queue"]}</p> : null}
        </div>
      </div>
    </Card>
    <Card><h2 className="text-xl font-bold">Conflict safety</h2><p className="mt-2 text-sm text-slate-400">Queued writes compare the expected record version with the current cloud version. Mismatches are marked Conflict and remain in the queue; JR OS does not silently overwrite the cloud record.</p></Card>
  </div>;
}
