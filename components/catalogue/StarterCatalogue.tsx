"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { JobPack, Material } from "../../lib/models";
import type { useCloudIdentity } from "../../lib/cloud/useCloudIdentity";
import { captureSupabaseSessionOwnership, readSupabaseSession, readSupabaseSessionOwnershipEpoch } from "../../lib/supabase/client";
import { sameSupabaseSessionOwnership, supabaseSessionUserId } from "../../lib/supabase/sessionOwnership-core.mjs";
import { catalogueImportPlan, importCataloguePlan } from "../../lib/jobPackCatalogue";
import { starterJobPacks, starterMaterials } from "../../lib/starterData";
import { JobPackBreakdown } from "../jobs/JobPackBreakdown";
import { Button } from "../ui/Button";

type Collection<T> = { items: T[]; isReady: boolean; createItem: (item: T) => unknown };
type Props = { materials: Collection<Material>; packs: Collection<JobPack>; identityState: ReturnType<typeof useCloudIdentity> };
export function StarterCatalogue({ materials, packs, identityState }: Props) {
  const member = identityState.identity, local = identityState.mode === "local";
  const enabled = materials.isReady && packs.isReady && identityState.isReady && (local || Boolean(member && ["owner", "admin", "office"].includes(member.role)));
  const ownership = captureSupabaseSessionOwnership();
  const accountKey = JSON.stringify([identityState.mode, member?.organisationId, member?.userId, member?.role, member?.customerSourceId, ownership.epoch]);
  const scope = useMemo(() => ({ accountKey, enabled }), [accountKey, enabled]);
  const [approvedScope, setApprovedScope] = useState<object | null>(null);
  const [notice, setNotice] = useState<{ scope: object; message: string; error: boolean } | null>(null);
  const [busyScope, setBusyScope] = useState<object | null>(null);
  const [search, setSearch] = useState("");
  const latest = useRef({ active: false, scope, materials, packs, approved: false });
  const operation = useRef<object | null>(null);
  const busy = busyScope === scope, approved = approvedScope === scope;
  useLayoutEffect(() => { latest.current = { active: true, scope, materials, packs, approved }; return () => { latest.current.active = false; }; });
  const active = () => latest.current.active && latest.current.scope === scope && enabled && latest.current.materials.isReady && latest.current.packs.isReady
    && (local || Boolean(ownership.session?.access_token && !ownership.session.is_password_recovery && supabaseSessionUserId(ownership.session) === member?.userId
      && sameSupabaseSessionOwnership(readSupabaseSession(), readSupabaseSessionOwnershipEpoch(), ownership.session, ownership.epoch)));

  async function add(includePacks: boolean) {
    if (!active() || !latest.current.approved || operation.current) return;
    const task = {}; operation.current = task; setBusyScope(scope); setNotice(null);
    const isCurrent = () => active() && operation.current === task;
    try {
      const current = latest.current, plan = catalogueImportPlan(current.materials.items, current.packs.items, starterMaterials, starterJobPacks, includePacks);
      const now = new Date().toISOString();
      const result = await importCataloguePlan(plan, { isCurrent,
        createMaterial: item => current.materials.createItem({ ...item, createdAt: now, updatedAt: now }),
        createPack: item => current.packs.createItem({ ...item, createdAt: now, updatedAt: now }),
        onProgress: (materialCount, packCount) => { if (isCurrent()) setNotice({ scope, message: `Adding catalogue: ${materialCount} materials and ${packCount} job packs saved…`, error: false }); },
      });
      if (!isCurrent()) return;
      setNotice({ scope, error: Boolean(result.error), message: `Added ${result.materials} materials and ${result.packs} job packs. ${result.error || "Existing records and edited prices were kept. Saved on this device or queued for sync; check Cloud sync for confirmation."}` });
    } catch (error) { if (isCurrent()) setNotice({ scope, error: true, message: error instanceof Error ? error.message : "Import failed. Your existing records were kept." }); }
    finally { if (operation.current === task) { operation.current = null; setBusyScope(null); } }
  }
  const visible = starterJobPacks.filter(pack => `${pack.name} ${pack.category} ${pack.description}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <details className="rounded-2xl border border-cyan-400/30 bg-slate-900 p-4">
    <summary className="min-h-12 cursor-pointer py-3 font-bold">Browse & add starter catalogue · {starterJobPacks.length} job packs · {starterMaterials.length} materials</summary>
    <div className="mt-3 space-y-4">
      <p className="text-sm text-amber-200">Guide allowances only, not live supplier quotes or a circuit design. Historical JR job prices are labelled benchmarks; estimated material lists are not reconstructed actual bills. Check current buying prices, compatibility, routes, access, testing and notification before quoting.</p>
      <p className="text-sm text-slate-300">Adds missing catalogue IDs only. Existing packs, supplier codes and edited prices are never replaced. Adding packs also adds their missing materials. Import is optional and never sends a quote or places an order.</p>
      {!enabled ? <p className="text-sm text-amber-200">Load your library and sign in with an office account before importing, or use local mode.</p> : null}
      <label className="flex min-h-12 items-center gap-3 text-sm"><input type="checkbox" checked={approved} disabled={!enabled || busy} onChange={event => { if (active() && !operation.current) setApprovedScope(event.target.checked ? scope : null); }} />I understand these are editable estimates and will check them before quoting.</label>
      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={!enabled || !approved || busy} onClick={() => add(true)}>Add missing job packs & materials</Button>
        <Button type="button" variant="secondary" disabled={!enabled || !approved || busy} onClick={() => add(false)}>Add missing materials only</Button>
      </div>
      {notice?.scope === scope ? <p role={notice.error ? "alert" : "status"} className="text-sm text-amber-200">{notice.message}</p> : null}
      <label className="grid gap-2 text-sm font-semibold">Search starter job packs<input type="search" value={search} onChange={event => setSearch(event.target.value)} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base" placeholder="Try rewire, socket, kitchen or EICR" /></label>
      <p className="text-xs text-slate-400">{visible.length} starter packs. Preview below uses starter allowances; your imported copies remain editable in Job Packs.</p>
      <div className="grid gap-4 xl:grid-cols-2">{visible.map(pack => <article key={pack.id} className="min-w-0 rounded-xl border border-slate-700 p-4"><p className="text-xs text-cyan-300">{pack.category}</p><h3 className="mt-1 font-bold">{pack.name}</h3><p className="mt-2 text-sm text-slate-400">{pack.description}</p><JobPackBreakdown pack={pack} materials={starterMaterials} /></article>)}</div>
    </div>
  </details>;
}
