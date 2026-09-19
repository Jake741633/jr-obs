"use client";

import Link from "next/link";
import { CheckCircle2, PackagePlus, Sparkles, Wrench } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { useLocalStorageCollection } from "../../lib/storage";
import { starterJobPacks, starterMaterials } from "../../lib/starterData";
import type { JobPack, Material } from "../../lib/models";

export default function StarterLibraryPage() {
  const materials = useLocalStorageCollection<Material>("jr-os-materials");
  const packs = useLocalStorageCollection<JobPack>("jr-os-job-packs");

  const starterMaterialCount = materials.items.filter((item) => item.id.startsWith("starter-mat-")).length;
  const starterPackCount = packs.items.filter((item) => item.id.startsWith("starter-pack-")).length;
  const ready = materials.isReady && packs.isReady;

  function importMaterials() {
    materials.setItems((current) => {
      const existingIds = new Set(current.map((item) => item.id));
      const missing = starterMaterials.filter((item) => !existingIds.has(item.id));
      return [...missing, ...current];
    });
  }

  function importPacks() {
    packs.setItems((current) => {
      const existingIds = new Set(current.map((item) => item.id));
      const missing = starterJobPacks.filter((item) => !existingIds.has(item.id));
      return [...missing, ...current];
    });
  }

  function importEverything() {
    importMaterials();
    importPacks();
  }

  function removeStarterMaterials() {
    if (!window.confirm("Remove only the JR OS starter materials? Materials you created yourself will remain.")) return;
    materials.setItems((current) => current.filter((item) => !item.id.startsWith("starter-mat-")));
  }

  function removeStarterPacks() {
    if (!window.confirm("Remove only the JR OS starter job packs? Packs you created yourself will remain.")) return;
    packs.setItems((current) => current.filter((item) => !item.id.startsWith("starter-pack-")));
  }

  if (!ready) return <Card>Preparing starter library…</Card>;

  return <main className="space-y-6">
    <PageHeader
      eyebrow="Setup"
      title="Starter materials & job packs"
      description="Load a practical starter library, then edit every price, quantity, labour allowance and scope to match the actual job and your supplier account."
      action={<Button onClick={importEverything}><Sparkles className="mr-2 size-4" />Import everything</Button>}
    />

    <Card className="border-amber-400/30 bg-amber-500/5">
      <div className="flex items-start gap-3">
        <Wrench className="mt-0.5 size-5 shrink-0 text-amber-300" />
        <div>
          <h2 className="font-semibold text-amber-100">Guide prices only</h2>
          <p className="mt-1 text-sm leading-6 text-slate-300">The starter prices are editable allowances, not live supplier prices. Confirm current trade costs, preferred brands, cable routes, labour time, testing and certification before using any pack in a customer quote.</p>
        </div>
      </div>
    </Card>

    <section className="grid gap-5 lg:grid-cols-2">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Materials</p><h2 className="mt-1 text-xl font-bold">70 common electrical materials</h2></div>
          <PackagePlus className="size-7 text-cyan-300" />
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-400">Cable, accessories, protection, containment, lighting, alarms, emergency lighting, EV allowances, testing and sundries.</p>
        <div className="mt-5 rounded-xl bg-slate-950 p-4"><p className="text-sm text-slate-400">Currently installed</p><p className="mt-1 text-3xl font-bold">{starterMaterialCount} / {starterMaterials.length}</p></div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button onClick={importMaterials}>{starterMaterialCount === starterMaterials.length ? "Library installed" : "Import materials"}</Button>
          <Link href="/materials" className="inline-flex min-h-11 items-center rounded-xl border border-slate-700 px-4 text-sm font-semibold">Open materials</Link>
          {starterMaterialCount ? <Button variant="danger" onClick={removeStarterMaterials}>Remove starters</Button> : null}
        </div>
      </Card>

      <Card>
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Templates</p><h2 className="mt-1 text-xl font-bold">20 editable job packs</h2></div>
          <CheckCircle2 className="size-7 text-cyan-300" />
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-400">Socket additions, consumer units, EICRs, fault finding, fans, lighting, alarms, garage supplies, EV work, kitchens and rewire starters.</p>
        <div className="mt-5 rounded-xl bg-slate-950 p-4"><p className="text-sm text-slate-400">Currently installed</p><p className="mt-1 text-3xl font-bold">{starterPackCount} / {starterJobPacks.length}</p></div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button onClick={importPacks}>{starterPackCount === starterJobPacks.length ? "Packs installed" : "Import job packs"}</Button>
          <Link href="/job-packs" className="inline-flex min-h-11 items-center rounded-xl border border-slate-700 px-4 text-sm font-semibold">Open job packs</Link>
          {starterPackCount ? <Button variant="danger" onClick={removeStarterPacks}>Remove starters</Button> : null}
        </div>
      </Card>
    </section>

    <Card>
      <h2 className="text-lg font-bold">How to use the starter packs safely</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {["Import the materials first so pack lines can link to the library.", "Open a pack and edit labour hours, rate, quantities and selling prices.", "Check access, circuit condition, testing, certification, exclusions and making good.", "Pull the edited pack into a quote, then run AI Quote Review before sending."].map((item, index) => <div key={item} className="rounded-xl bg-slate-950 p-4 text-sm text-slate-300"><span className="mb-2 grid size-7 place-items-center rounded-full bg-cyan-400/10 font-bold text-cyan-300">{index + 1}</span>{item}</div>)}
      </div>
    </Card>
  </main>;
}
