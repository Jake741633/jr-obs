"use client";

import { FormEvent, MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Cloud, CloudDownload, CloudOff, CloudUpload, LogIn, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import {
  completeEmailVerificationFromUrl,
  canManageCloudMigration,
  getCurrentCloudUser,
  migrateLocalDataToCloud,
  migrateTypedLocalDataToCloud,
  readLastCloudSync,
  restoreCloudDataToLocal,
  signInWithEmail,
  signOutCloudUser,
  signUpWithEmail,
  type TypedMigrationProgress,
} from "../../lib/cloudSync";
import {
  canRetainSettledCloudIdentity,
  clearSubmittedValue,
  createCloudPageOperationCoordinator,
  matchedCloudPageIdentity,
  normalCloudPageSessionUserId,
  ownedCloudPageValue,
  type CloudAccountUser,
  type CloudPageIdentity,
  type CloudPageOperation,
  type CloudPageOperationCoordinator,
} from "../../lib/cloud/cloudPageIdentity-core.mjs";
import { effectiveCloudMode } from "../../lib/cloud/config";
import { activeSyncAuthorizationMatches, flushSyncQueue, syncStatus, type SyncAuthorizationContext, type SyncState } from "../../lib/cloud/repository";
import { useCloudIdentity } from "../../lib/cloud/useCloudIdentity";
import { captureSupabaseSessionOwnership, isSupabaseConfigured, readSupabaseSession } from "../../lib/supabase/client";

const fieldClass = "min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-white outline-none focus:border-cyan-400";
type MigrationAction = "typed-import" | "legacy-copy" | "legacy-restore" | "retry-queue";
type AccountAction = "email-verification" | "sign-in" | "create-account" | "sign-out";
type CloudOperation = MigrationAction | AccountAction;
interface OwnedValue<T> { ownerKey: string; value: T; }
const emptyResults: Record<MigrationAction, OwnedValue<string> | null> = { "typed-import": null, "legacy-copy": null, "legacy-restore": null, "retry-queue": null };

export default function CloudPage() {
  const configured = isSupabaseConfigured();
  const { identity, isReady: identityReady } = useCloudIdentity();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountUser, setAccountUser] = useState<CloudAccountUser | null>(null);
  const [settledIdentity, setSettledIdentity] = useState<CloudPageIdentity | null>(null);
  const [accountMessage, setAccountMessage] = useState("");
  const [activeOperation, setActiveOperation] = useState<CloudOperation | null>(null);
  const [actionResults, setActionResults] = useState<Record<MigrationAction, OwnedValue<string> | null>>(emptyResults);
  const [importProgress, setImportProgress] = useState<OwnedValue<TypedMigrationProgress> | null>(null);
  const [sync, setSync] = useState<OwnedValue<SyncState> | null>(null);
  const [lastSync, setLastSync] = useState<OwnedValue<string | null> | null>(null);
  const settledIdentityRef = useRef<CloudPageIdentity | null>(null);
  const operationCoordinatorRef = useRef<CloudPageOperationCoordinator | null>(null);
  if (!operationCoordinatorRef.current) operationCoordinatorRef.current = createCloudPageOperationCoordinator();
  const accountUserRequestVersionRef = useRef(0);
  const emailRevisionRef = useRef(0);
  const passwordRevisionRef = useRef(0);
  const mountedRef = useRef(true);

  const currentSession = readSupabaseSession();
  const currentSessionUserId = normalCloudPageSessionUserId(currentSession);
  const identitySession = useMemo(() => currentSession?.access_token ? {
    access_token: currentSession.access_token,
    is_password_recovery: currentSession.is_password_recovery,
    user: currentSessionUserId ? { id: currentSessionUserId } : undefined,
  } : null, [currentSession?.access_token, currentSession?.is_password_recovery, currentSessionUserId]);
  const candidateIdentity = useMemo(
    () => matchedCloudPageIdentity(identity, accountUser, identitySession),
    [accountUser, identity, identitySession],
  );
  const retainSettledIdentity = canRetainSettledCloudIdentity(settledIdentity, identityReady, identitySession);
  const displayIdentity = candidateIdentity ?? (retainSettledIdentity ? settledIdentity : null);
  const sessionAccountUser = accountUser && currentSessionUserId === accountUser.id ? accountUser : null;
  const userEmail = displayIdentity?.email ?? sessionAccountUser?.email ?? null;
  const displayOwnerKey = displayIdentity?.key ?? null;
  const visibleProgress = ownedCloudPageValue(importProgress, displayOwnerKey, null);
  const visibleSync = ownedCloudPageValue(sync, displayOwnerKey, "Offline");
  const visibleLastSync = ownedCloudPageValue(lastSync, displayOwnerKey, null);
  const operationBusy = activeOperation !== null;
  const activeOwnedAction = operationCoordinatorRef.current.current()?.ownerKey === displayOwnerKey ? activeOperation : null;

  const invalidateActiveOperation = useCallback(() => {
    operationCoordinatorRef.current?.invalidate();
    setActiveOperation(null);
  }, []);

  const clearAccountInputs = useCallback(() => {
    emailRevisionRef.current += 1;
    passwordRevisionRef.current += 1;
    setEmail("");
    setPassword("");
  }, []);

  const clearOwnedState = useCallback(() => {
    invalidateActiveOperation();
    accountUserRequestVersionRef.current += 1;
    clearAccountInputs();
    settledIdentityRef.current = null;
    setAccountUser(null);
    setSettledIdentity(null);
    setActionResults(emptyResults);
    setImportProgress(null);
    setSync(null);
    setLastSync(null);
    setAccountMessage("");
  }, [clearAccountInputs, invalidateActiveOperation]);

  const refreshAccountUser = useCallback(async () => {
    const requestVersion = ++accountUserRequestVersionRef.current;
    const user = await getCurrentCloudUser();
    if (mountedRef.current && requestVersion === accountUserRequestVersionRef.current) {
      setAccountUser(user);
    }
    return user;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let active = true;
    const verificationOperation = operationCoordinatorRef.current?.begin("email-verification") ?? null;
    if (verificationOperation) setActiveOperation("email-verification");
    const verificationIsCurrent = () => Boolean(
      active
      && verificationOperation
      && operationCoordinatorRef.current?.isCurrent(verificationOperation),
    );
    void (async () => {
      if (!verificationOperation) return;
      try {
        const verification = await completeEmailVerificationFromUrl(verificationIsCurrent);
        if (!verificationIsCurrent()) return;
        if (verification?.requiresPasswordSignIn) {
          accountUserRequestVersionRef.current += 1;
          setAccountUser(null);
        } else if (verification?.user) {
          accountUserRequestVersionRef.current += 1;
          setAccountUser(verification.user);
        } else {
          await refreshAccountUser();
        }
        if (!verificationIsCurrent()) return;
        if (verification?.requiresPasswordSignIn) {
          setAccountMessage("Email verified. Sign in with your password to open JR OS.");
        } else if (verification?.user) {
          setAccountMessage("Email verified. You are now signed in securely.");
        }
      } catch (error) {
        if (!verificationIsCurrent()) return;
        setAccountMessage(error instanceof Error ? error.message : "Email verification could not be completed.");
      } finally {
        if (operationCoordinatorRef.current?.finish(verificationOperation)) setActiveOperation(null);
      }
    })();
    const handleSessionChange = () => {
      // An explicit auth/session event is a real ownership boundary, unlike a
      // focus revalidation. Clear secrets and invalidate any in-flight work
      // before resolving the replacement account.
      clearOwnedState();
      void refreshAccountUser();
    };
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === "jr-os-supabase-session") handleSessionChange();
    };
    const handleSyncStatus = (event: Event) => {
      const owner = settledIdentityRef.current;
      if (!owner || !activeSyncAuthorizationMatches(owner)) return;
      setSync({ ownerKey: owner.key, value: (event as CustomEvent<SyncState>).detail });
    };
    window.addEventListener("jr-os-cloud-identity-changed", handleSessionChange);
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("jr-os-sync-status", handleSyncStatus);
    return () => {
      active = false;
      mountedRef.current = false;
      accountUserRequestVersionRef.current += 1;
      window.removeEventListener("jr-os-cloud-identity-changed", handleSessionChange);
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("jr-os-sync-status", handleSyncStatus);
    };
  }, [clearOwnedState, refreshAccountUser]);

  useEffect(() => {
    if (!identityReady) {
      if (operationCoordinatorRef.current?.current()?.ownerKey) invalidateActiveOperation();
      return;
    }
    if (!candidateIdentity) {
      if (settledIdentityRef.current) clearOwnedState();
      return;
    }

    const identityChanged = settledIdentityRef.current?.key !== candidateIdentity.key;
    if (identityChanged) {
      invalidateActiveOperation();
      clearAccountInputs();
      setActionResults(emptyResults);
      setImportProgress(null);
      setAccountMessage("");
    }
    settledIdentityRef.current = candidateIdentity;
    setSettledIdentity(candidateIdentity);
    setLastSync({ ownerKey: candidateIdentity.key, value: readLastCloudSync(candidateIdentity.organisationId) });
    setSync({
      ownerKey: candidateIdentity.key,
      value: activeSyncAuthorizationMatches(candidateIdentity) ? syncStatus.get() : "Offline",
    });
  }, [candidateIdentity, clearAccountInputs, clearOwnedState, identityReady, invalidateActiveOperation]);

  function beginOperation(action: CloudOperation, ownerKey: string | null = null) {
    const operation = operationCoordinatorRef.current?.begin(action, ownerKey) ?? null;
    if (!operation) return null;
    setActiveOperation(action);
    return operation;
  }

  function finishOperation(operation: CloudPageOperation) {
    if (!operationCoordinatorRef.current?.finish(operation)) return;
    setActiveOperation(null);
  }

  function ownedOperationIsCurrent(operation: CloudPageOperation) {
    if (!operationCoordinatorRef.current?.isCurrent(operation) || !operation.ownerKey) return false;
    const owner = settledIdentityRef.current;
    const session = readSupabaseSession();
    return Boolean(
      owner?.key === operation.ownerKey
      && normalCloudPageSessionUserId(session) === owner.userId
      && activeSyncAuthorizationMatches(owner),
    );
  }

  async function runAccountAction(
    actionName: AccountAction,
    action: (operationIsCurrent: () => boolean) => Promise<unknown>,
    success: string,
    submittedEmail: string,
    submittedEmailRevision: number,
    submittedPasswordRevision: number,
  ) {
    const operation = beginOperation(actionName);
    if (!operation) return;
    if (passwordRevisionRef.current === submittedPasswordRevision) {
      passwordRevisionRef.current += 1;
      setPassword("");
    }
    setAccountMessage("");
    let succeeded = false;
    const operationIsCurrent = () => Boolean(operationCoordinatorRef.current?.isCurrent(operation));
    try {
      await action(operationIsCurrent);
      if (!operationIsCurrent()) return;
      succeeded = true;
      setAccountMessage(success);
    } catch (error) {
      if (operationIsCurrent()) {
        setAccountMessage(error instanceof Error ? error.message : "The account action could not be completed.");
      }
    } finally {
      if (operationIsCurrent()) {
        if (succeeded && emailRevisionRef.current === submittedEmailRevision) {
          const currentRevision = emailRevisionRef.current;
          emailRevisionRef.current += 1;
          setEmail((current) => clearSubmittedValue(current, submittedEmail, currentRevision, submittedEmailRevision));
        }
        await refreshAccountUser();
        finishOperation(operation);
      }
    }
  }

  async function runMigrationAction(
    action: MigrationAction,
    operation: (onProgress: (progress: TypedMigrationProgress) => void, operationIsCurrent: () => boolean, owner: CloudPageIdentity) => Promise<string>,
  ) {
    const owner = displayIdentity;
    if (!owner || !identityReady || settledIdentityRef.current?.key !== owner.key) return;
    const authorization: SyncAuthorizationContext = owner;
    if (!activeSyncAuthorizationMatches(authorization)) return;
    const operationLease = beginOperation(action, owner.key);
    if (!operationLease) return;
    setActionResults((current) => ({ ...current, [action]: { ownerKey: owner.key, value: "" } }));
    if (action === "typed-import") {
      setImportProgress({
        ownerKey: owner.key,
        value: { currentCollection: "Preparing collections", completedCollections: 0, totalCollections: 0, imported: 0, skipped: 0, failed: 0 },
      });
    }
    const onProgress = (progress: TypedMigrationProgress) => {
      if (ownedOperationIsCurrent(operationLease)) setImportProgress({ ownerKey: owner.key, value: progress });
    };
    const operationIsCurrent = () => ownedOperationIsCurrent(operationLease);
    try {
      const result = await operation(onProgress, operationIsCurrent, owner);
      if (!ownedOperationIsCurrent(operationLease)) return;
      setActionResults((current) => ({ ...current, [action]: { ownerKey: owner.key, value: result } }));
      setLastSync({ ownerKey: owner.key, value: readLastCloudSync(owner.organisationId) });
      if (activeSyncAuthorizationMatches(owner)) setSync({ ownerKey: owner.key, value: syncStatus.get() });
    } catch (error) {
      if (ownedOperationIsCurrent(operationLease)) {
        setActionResults((current) => ({ ...current, [action]: { ownerKey: owner.key, value: error instanceof Error ? error.message : "The migration action could not be completed." } }));
      }
    } finally {
      finishOperation(operationLease);
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
    const submittedEmail = email;
    const submittedPassword = password;
    const submittedEmailRevision = emailRevisionRef.current;
    const submittedPasswordRevision = passwordRevisionRef.current;
    await runAccountAction("sign-in", (operationIsCurrent) => signInWithEmail(submittedEmail.trim(), submittedPassword, operationIsCurrent), "Signed in securely.", submittedEmail, submittedEmailRevision, submittedPasswordRevision);
  }

  async function createAccount() {
    if (!accountDetailsAreValid()) return;
    const submittedEmail = email;
    const submittedPassword = password;
    const submittedEmailRevision = emailRevisionRef.current;
    const submittedPasswordRevision = passwordRevisionRef.current;
    await runAccountAction("create-account", (operationIsCurrent) => signUpWithEmail(submittedEmail.trim(), submittedPassword, operationIsCurrent), "Account created. Check your email if confirmation is enabled.", submittedEmail, submittedEmailRevision, submittedPasswordRevision);
  }

  async function signOut() {
    const submittedEmail = email;
    const submittedEmailRevision = emailRevisionRef.current;
    const submittedPasswordRevision = passwordRevisionRef.current;
    const expectedOwnership = captureSupabaseSessionOwnership();
    clearAccountInputs();
    await runAccountAction("sign-out", (operationIsCurrent) => signOutCloudUser(expectedOwnership, operationIsCurrent), "Signed out.", submittedEmail, submittedEmailRevision, submittedPasswordRevision);
  }

  function importTypedRecords(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    void runMigrationAction("typed-import", async (onProgress, operationIsCurrent, owner) => {
      const result = await migrateTypedLocalDataToCloud(onProgress, operationIsCurrent, owner);
      const summary = `${result.uploaded} imported; ${result.skipped} skipped; ${result.errors.length} failed.`;
      if (result.errors.length) throw new Error(`${summary}\n${result.errors.join("\n")}`);
      return `Typed cloud import complete. ${summary} Local browser data was retained.`;
    });
  }

  function copyLegacyBackup(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    void runMigrationAction("legacy-copy", async (_onProgress, operationIsCurrent, owner) => {
      const result = await migrateLocalDataToCloud(operationIsCurrent, owner);
      const summary = `${result.uploaded} uploaded; ${result.skipped} skipped; ${result.errors.length} failed.`;
      if (result.errors.length) throw new Error(`${summary}\n${result.errors.join("\n")}`);
      return `Legacy backup copy complete. ${summary}`;
    });
  }

  function restoreLegacyBackup(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    void runMigrationAction("legacy-restore", async (_onProgress, operationIsCurrent, owner) => {
      const count = await restoreCloudDataToLocal(operationIsCurrent, owner);
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

  const settledOwnerMatchesDisplay = Boolean(displayOwnerKey && settledIdentity?.key === displayOwnerKey);
  const migrationUnavailable = !configured || !displayIdentity || !identityReady || !settledOwnerMatchesDisplay || !canManageCloudMigration(displayIdentity.role) || operationBusy;
  const retryUnavailable = !configured || !displayIdentity || !identityReady || !settledOwnerMatchesDisplay || operationBusy;

  return <div className="space-y-6">
    <div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Cloud foundation</p><h1 className="mt-1 text-3xl font-bold">Cloud & account</h1><p className="mt-2 text-sm text-slate-400">Connect JR OS to account-based storage without deleting or disabling existing browser records.</p></div>
    <div className="grid gap-4 md:grid-cols-4">
      <Card><Cloud className="size-6 text-cyan-300" /><p className="mt-3 font-bold">Configuration</p><p className="mt-2 text-sm text-slate-400">{configured ? "Supabase environment values detected." : "Waiting for Supabase project URL and public anon key."}</p></Card>
      <Card><ShieldCheck className="size-6 text-emerald-300" /><p className="mt-3 font-bold">Operating mode</p><p className="mt-2 text-sm capitalize text-slate-400">{effectiveCloudMode()}</p></Card>
      <Card>{visibleSync === "Offline" ? <CloudOff className="size-6 text-amber-300" /> : <RefreshCw className="size-6 text-cyan-300" />}<p className="mt-3 font-bold">Sync status</p><p className="mt-2 text-sm text-slate-400">{visibleSync}</p></Card>
      <Card><CheckCircle2 className="size-6 text-amber-300" /><p className="mt-3 font-bold">Last successful upload</p><p className="mt-2 text-sm text-slate-400">{visibleLastSync ? new Date(visibleLastSync).toLocaleString("en-GB") : "No cloud upload completed yet."}</p></Card>
    </div>
    {!configured ? <Card className="border-amber-500/30"><h2 className="text-xl font-bold">Connection required</h2><p className="mt-2 text-sm text-slate-400">Run both SQL files and add NEXT_PUBLIC_SUPABASE_URL plus NEXT_PUBLIC_SUPABASE_ANON_KEY. Local storage continues working meanwhile.</p></Card> : null}
    <Card><h2 className="text-xl font-bold">JR OS account</h2>{userEmail ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4"><div><p className="font-semibold text-emerald-200">Signed in</p><p className="text-sm text-slate-400">{userEmail}</p></div><Button type="button" disabled={operationBusy} onClick={() => void signOut()}><LogOut className="mr-2 size-4" />Sign out</Button></div> : <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={signIn}><label className="grid gap-2 text-sm">Email<input type="email" autoComplete="email" required className={fieldClass} value={email} onChange={(event) => { emailRevisionRef.current += 1; setEmail(event.target.value); }} /></label><label className="grid gap-2 text-sm">Password<input type="password" autoComplete="current-password" minLength={8} required className={fieldClass} value={password} onChange={(event) => { passwordRevisionRef.current += 1; setPassword(event.target.value); }} /></label><div className="flex flex-wrap gap-3 md:col-span-2"><Button disabled={operationBusy || !configured} type="submit"><LogIn className="mr-2 size-4" />Sign in</Button><Button disabled={operationBusy || !configured} type="button" onClick={() => void createAccount()}>Create account</Button></div></form>}{accountMessage ? <p className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-cyan-200">{accountMessage}</p> : null}</Card>
    <Card>
      <h2 className="text-xl font-bold">Data migration controls</h2>
      <p className="mt-2 text-sm text-slate-400">The legacy backup copy remains available. The typed migration copies individual records using their existing local IDs and skips unchanged records.</p>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 p-4">
          <Button type="button" disabled={migrationUnavailable} onClick={importTypedRecords}><CloudUpload className="mr-2 size-4" />{activeOwnedAction === "typed-import" ? "Importing typed records…" : "Import records to typed tables"}</Button>
          {visibleProgress ? <div className="mt-3 space-y-1 text-sm text-slate-400"><p>Current collection: <span className="text-slate-200">{visibleProgress.currentCollection}</span></p><p>Collections: {visibleProgress.completedCollections}/{visibleProgress.totalCollections || "…"}</p><p>{visibleProgress.imported} imported · {visibleProgress.skipped} skipped · {visibleProgress.failed} failed</p>{visibleProgress.latestError ? <p className="whitespace-pre-wrap text-red-300">{visibleProgress.latestError}</p> : null}</div> : null}
          {actionResults["typed-import"]?.ownerKey === displayOwnerKey && actionResults["typed-import"]?.value ? <p className="mt-3 whitespace-pre-wrap rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-cyan-200">{actionResults["typed-import"]?.value}</p> : null}
        </div>
        <div className="rounded-xl border border-slate-800 p-4">
          <Button type="button" disabled={migrationUnavailable} onClick={copyLegacyBackup}><CloudUpload className="mr-2 size-4" />{activeOwnedAction === "legacy-copy" ? "Copying legacy backup…" : "Copy legacy backup"}</Button>
          {actionResults["legacy-copy"]?.ownerKey === displayOwnerKey && actionResults["legacy-copy"]?.value ? <p className="mt-3 whitespace-pre-wrap rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-cyan-200">{actionResults["legacy-copy"]?.value}</p> : null}
        </div>
        <div className="rounded-xl border border-slate-800 p-4">
          <Button type="button" disabled={migrationUnavailable} onClick={restoreLegacyBackup}><CloudDownload className="mr-2 size-4" />{activeOwnedAction === "legacy-restore" ? "Restoring legacy backup…" : "Restore legacy backup"}</Button>
          {actionResults["legacy-restore"]?.ownerKey === displayOwnerKey && actionResults["legacy-restore"]?.value ? <p className="mt-3 whitespace-pre-wrap rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-cyan-200">{actionResults["legacy-restore"]?.value}</p> : null}
        </div>
        <div className="rounded-xl border border-slate-800 p-4">
          <Button type="button" disabled={retryUnavailable} onClick={retryPendingChanges}><RefreshCw className="mr-2 size-4" />{activeOwnedAction === "retry-queue" ? "Retrying pending changes…" : "Retry pending changes"}</Button>
          {actionResults["retry-queue"]?.ownerKey === displayOwnerKey && actionResults["retry-queue"]?.value ? <p className="mt-3 whitespace-pre-wrap rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-cyan-200">{actionResults["retry-queue"]?.value}</p> : null}
        </div>
      </div>
    </Card>
    <Card><h2 className="text-xl font-bold">Conflict safety</h2><p className="mt-2 text-sm text-slate-400">Queued writes compare the expected record version with the current cloud version. Mismatches are marked Conflict and remain in the queue; JR OS does not silently overwrite the cloud record.</p></Card>
  </div>;
}
