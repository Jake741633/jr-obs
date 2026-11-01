"use client";

import Link from "next/link";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { StarterCatalogue } from "../../components/catalogue/StarterCatalogue";
import { useJobPacksCollection, useMaterialsCollection } from "../../lib/cloud/coreBusinessCollections";
import { useCloudIdentity } from "../../lib/cloud/useCloudIdentity";

export default function StarterLibraryPage() {
  const materials = useMaterialsCollection();
  const packs = useJobPacksCollection();
  const identityState = useCloudIdentity();
  return <main className="space-y-6">
    <PageHeader eyebrow="Setup" title="Electrical job & materials catalogue" description="Editable starter packs for small jobs through full rewires. Review the allowances, then add missing records to your library." />
    <StarterCatalogue materials={materials} packs={packs} identityState={identityState} />
    <Card>
      <h2 className="text-lg font-bold">Your daily quoting workflow</h2>
      <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-slate-300">
        <li>Open the catalogue above, review the estimate notice and add the missing packs and materials. Existing records and your edited prices stay unchanged.</li>
        <li>In Job Packs, edit the quantities, buying costs, selling allowances and labour for the actual job. Internal pricing notes stay separate from customer scope.</li>
        <li>In Materials, paste verified supplier links and stock codes. Use Copy code, Copy link or Share without including your prices or margin.</li>
        <li>Add the reviewed pack to a quote. Check the site, current supplier costs, exclusions, testing, certification and VAT settings before sending.</li>
      </ol>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link href="/job-packs" className="inline-flex min-h-12 items-center rounded-xl border border-slate-700 px-4 font-semibold">Open Job Packs</Link>
        <Link href="/materials" className="inline-flex min-h-12 items-center rounded-xl border border-slate-700 px-4 font-semibold">Open Materials</Link>
        <Link href="/quotes" className="inline-flex min-h-12 items-center rounded-xl border border-slate-700 px-4 font-semibold">Open Quotes</Link>
      </div>
    </Card>
  </main>;
}
