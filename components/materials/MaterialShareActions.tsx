"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { materialShareDetails, type ShareableMaterial } from "../../lib/materialSharing";

type Props = {
  material: ShareableMaterial;
  enabled?: boolean;
  /** Include record identity and the account/ownership scope, not just its display name. */
  contextKey?: string;
  /** Parent-owned, live readiness/record/ownership check, evaluated again on every action. */
  canUse?: () => boolean;
};

export function MaterialShareActions({ material, enabled = true, contextKey = "", canUse }: Props) {
  const details = materialShareDetails(material);
  const { name, supplier, stockCode, supplierUrl, text } = details;
  const scope = useMemo(() => ({ name, supplier, stockCode, supplierUrl, text, contextKey, enabled }), [name, supplier, stockCode, supplierUrl, text, contextKey, enabled]);
  const latest = useRef({ active: false, scope, enabled, canUse });
  const operation = useRef<object | null>(null);
  const [busyScope, setBusyScope] = useState<object | null>(null);
  const [notice, setNotice] = useState<{ scope: object; message: string; fallback?: string } | null>(null);
  const currentNotice = enabled && notice?.scope === scope ? notice : null;
  const busy = busyScope !== null;

  useLayoutEffect(() => {
    latest.current = { active: true, scope, enabled, canUse };
    return () => { latest.current.active = false; };
  });

  function active() {
    if (!latest.current.active || latest.current.scope !== scope || !latest.current.enabled) return false;
    try { return latest.current.canUse ? latest.current.canUse() === true : true; } catch { return false; }
  }

  async function run(kind: "code" | "link" | "share") {
    const value = kind === "code" ? stockCode : kind === "link" ? supplierUrl : text;
    if (!value || !active() || operation.current) return;
    const task = {}; operation.current = task;
    setBusyScope(scope); setNotice(null);
    const isCurrent = () => active() && operation.current === task;
    const fallback = (message: string) => {
      if (isCurrent()) setNotice({ scope, message, fallback: value });
    };
    try {
      // Invoke the browser API directly in the click turn, before any async work.
      if (kind === "share" && typeof navigator !== "undefined" && typeof navigator.share === "function") {
        try {
          await navigator.share({ title: name || "Material", text });
          if (isCurrent()) setNotice({ scope, message: "Share sheet completed. Delivery is not confirmed." });
        } catch (error) {
          if ((error as { name?: string })?.name === "AbortError") {
            if (isCurrent()) setNotice({ scope, message: "Share cancelled." });
          } else {
            fallback("Sharing is unavailable. Select the details below to copy or share manually.");
          }
        }
      } else if (typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function") {
        try {
          await navigator.clipboard.writeText(value);
          if (isCurrent()) setNotice({ scope, message: kind === "share" ? "Product details copied. Paste them into your chosen app." : kind === "code" ? "Code copied." : "Link copied." });
        } catch {
          fallback("Clipboard access is unavailable. Select the text below to copy manually.");
        }
      } else {
        fallback("Select the text below to copy manually, then paste it into your chosen app.");
      }
    } finally {
      if (operation.current === task) {
        operation.current = null;
        setBusyScope(null);
      }
    }
  }

  const buttonClass = "min-h-12 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
  return <div className="space-y-2">
    <div className="flex flex-wrap gap-2" role="group" aria-label="Share material product details">
      <button type="button" className={buttonClass} disabled={!enabled || busy || !stockCode} onClick={() => run("code")}>Copy code</button>
      <button type="button" className={buttonClass} disabled={!enabled || busy || !supplierUrl} onClick={() => run("link")}>Copy link</button>
      <button type="button" className={buttonClass} disabled={!enabled || busy || !text} onClick={() => run("share")}>Share</button>
    </div>
    <p role="status" aria-live="polite" className="text-xs text-slate-400">{currentNotice?.message || (busy ? "Opening product sharing…" : "Shares product name, supplier, code and link only. No prices or private notes.")}</p>
    {currentNotice?.fallback && <textarea readOnly aria-label="Product details to select and copy" value={currentNotice.fallback} rows={Math.min(5, currentNotice.fallback.split("\n").length + 1)} className="min-h-12 w-full select-text rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-100" onFocus={event => event.currentTarget.select()} />}
  </div>;
}
