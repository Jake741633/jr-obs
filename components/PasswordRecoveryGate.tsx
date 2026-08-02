"use client";

import { FormEvent, useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { completeEmailVerificationFromUrl, signOutCloudUser } from "../lib/cloudSync";
import { supabaseFetch } from "../lib/supabase/client";
import { Button } from "./ui/Button";

const fieldClass = "min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-white outline-none focus:border-cyan-400";

type RecoveryState = "checking" | "inactive" | "ready" | "saving" | "complete" | "error";

export function PasswordRecoveryGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<RecoveryState>("checking");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function prepareRecovery() {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const isRecovery = hash.get("type") === "recovery";
      if (!isRecovery) {
        if (active) setState("inactive");
        return;
      }

      try {
        await completeEmailVerificationFromUrl();
        if (active) setState("ready");
      } catch (error) {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "This recovery link could not be verified.");
        setState("error");
      }
    }

    void prepareRecovery();
    return () => { active = false; };
  }, []);

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (password.length < 8) {
      setMessage("Your new password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmation) {
      setMessage("The passwords do not match.");
      return;
    }

    setState("saving");
    try {
      await supabaseFetch("/auth/v1/user", {
        method: "PUT",
        body: JSON.stringify({ password }),
      });
      setState("complete");
      setMessage("Password updated. You can now sign in normally with your new password.");
    } catch (error) {
      setState("ready");
      setMessage(error instanceof Error ? error.message : "The password could not be updated.");
    }
  }

  async function returnToSignIn() {
    await signOutCloudUser();
    window.location.assign("/cloud");
  }

  if (state === "inactive") return children;
  if (state === "checking") return <div className="grid min-h-screen place-items-center bg-slate-950 px-4 text-sm text-slate-400">Checking secure recovery link…</div>;

  return <div className="grid min-h-screen place-items-center bg-slate-950 px-4 py-10 text-white">
    <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
      <KeyRound className="size-9 text-cyan-300" />
      <h1 className="mt-4 text-2xl font-bold">Set a new password</h1>
      <p className="mt-2 text-sm text-slate-400">Complete password recovery before opening JR OS business records.</p>

      {state === "error" ? <div className="mt-5 space-y-4"><p className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-200">{message}</p><Button type="button" onClick={() => window.location.assign("/cloud")}>Return to sign in</Button></div> : null}

      {state === "complete" ? <div className="mt-5 space-y-4"><p className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-200">{message}</p><Button type="button" onClick={() => void returnToSignIn()}>Continue to sign in</Button></div> : null}

      {state === "ready" || state === "saving" ? <form className="mt-5 space-y-4" onSubmit={updatePassword}>
        <label className="grid gap-2 text-sm"><span>New password</span><input className={fieldClass} type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <label className="grid gap-2 text-sm"><span>Confirm new password</span><input className={fieldClass} type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
        {message ? <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-200">{message}</p> : null}
        <Button type="submit" disabled={state === "saving"}>{state === "saving" ? "Updating password…" : "Update password"}</Button>
      </form> : null}
    </div>
  </div>;
}
