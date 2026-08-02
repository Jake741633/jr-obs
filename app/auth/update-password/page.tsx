"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { updateRecoveredPassword } from "../../../lib/passwordRecovery";
import { signOutCloudUser } from "../../../lib/cloudSync";

const fieldClass = "min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-white outline-none focus:border-cyan-400";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (password !== confirmPassword) {
      setMessage("The passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      await updateRecoveredPassword(password);
      await signOutCloudUser();
      setComplete(true);
      setMessage("Password updated. Sign in normally using your new password.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Your password could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="mx-auto grid min-h-[65vh] max-w-lg place-items-center">
    <Card className="w-full">
      <LockKeyhole className="size-8 text-cyan-300" />
      <h1 className="mt-4 text-2xl font-bold">Set a new password</h1>
      <p className="mt-2 text-sm text-slate-400">Choose a new password for this JR OS account. You will be signed out after it is saved.</p>
      {complete ? <div className="mt-5 space-y-4"><p className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-200">{message}</p><Link href="/cloud" className="inline-flex min-h-11 items-center rounded-xl bg-cyan-400 px-4 text-sm font-semibold text-slate-950">Return to sign in</Link></div> : <form className="mt-5 space-y-4" onSubmit={submit}>
        <label className="grid gap-2 text-sm">New password<input className={fieldClass} type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <label className="grid gap-2 text-sm">Confirm new password<input className={fieldClass} type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
        <Button type="submit" disabled={busy}>{busy ? "Updating password…" : "Update password"}</Button>
        {message ? <p className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-amber-200">{message}</p> : null}
      </form>}
    </Card>
  </div>;
}
