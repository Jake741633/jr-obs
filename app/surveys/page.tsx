"use client";

import Link from "next/link";
import { ClipboardCheck, Plus, Search, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { useSurveysCollection } from "../../lib/cloud/coreBusinessCollections";
import { makeId, useCloudLocalCollection } from "../../lib/storage";
import type { Customer, Job, SiteSurvey } from "../../lib/models";

function blankSurvey(index: number): SiteSurvey {
  const now = new Date().toISOString();
  return {
    id: makeId("survey"), number: `SUR-${String(index + 1).padStart(4, "0")}`, status: "Draft",
    propertyType: "House", occupancy: "Occupied", floors: 2, bedrooms: 3, constructionType: "", loftAccess: "", installationAge: "",
    earthingArrangement: "TN-C-S", supplyType: "Single phase", fuseRating: "100A", cutoutType: "", meterPosition: "", consumerUnitPosition: "", mainBonding: "", earthingConductorSize: "",
    consumerUnitManufacturer: "", consumerUnitWays: "", spdFitted: false, rcbosFitted: false, rcdType: "", spareWays: "", consumerUnitCondition: "",
    circuits: [], photos: [], defects: [], risks: [], recommendations: [], voiceNotes: "", surveyNotes: "", labourHours: 0, labourRate: 45, healthScore: 100,
    createdAt: now, updatedAt: now,
  };
}

export default function SurveysPage() {
  const surveys = useSurveysCollection();
  const customers = useCloudLocalCollection<Customer>("jr-os-customers");
  const jobs = useCloudLocalCollection<Job>("jr-os-jobs");
  const [search, setSearch] = useState("");

  function createSurvey() {
    const survey = blankSurvey(surveys.items.length);
    surveys.setItems((current) => [survey, ...current]);
    window.location.href = `/surveys/${survey.id}`;
  }

  const filtered = surveys.items.filter((survey) => {
    const customer = customers.items.find((item) => item.id === survey.customerId)?.name ?? "";
    const job = jobs.items.find((item) => item.id === survey.jobId)?.title ?? "";
    return `${survey.number} ${customer} ${job} ${survey.propertyType}`.toLowerCase().includes(search.toLowerCase());
  });

  if (!surveys.isReady || !customers.isReady || !jobs.isReady) return <Card>Loading surveys…</Card>;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Site intelligence</p><h1 className="mt-1 text-3xl font-bold">Surveys</h1><p className="mt-2 text-sm text-slate-400">Capture the installation, defects, risks and recommendations before building a quote.</p></div>
      <Button onClick={createSurvey}><Plus className="mr-2 size-4" />New survey</Button>
    </div>

    <Card><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 size-5 text-slate-500" /><input aria-label="Search surveys" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search survey, customer or job" className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-3 text-white outline-none placeholder:text-slate-600 focus:border-cyan-400" /></div></Card>

    {filtered.length === 0 ? <Card><div className="grid place-items-center py-10 text-center"><ClipboardCheck className="size-10 text-slate-600" /><h2 className="mt-4 text-lg font-bold">No surveys found</h2><p className="mt-2 max-w-md text-sm text-slate-400">Create your first survey and complete it from your phone while walking around the property.</p></div></Card> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((survey) => {
      const customer = customers.items.find((item) => item.id === survey.customerId);
      const job = jobs.items.find((item) => item.id === survey.jobId);
      return <Card key={survey.id} className="h-full"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{survey.number}</p><h2 className="mt-2 text-lg font-bold">{job?.title || `${survey.propertyType} survey`}</h2></div><StatusBadge status={survey.status} /></div><p className="mt-3 text-sm text-slate-400">{customer?.name || "No customer linked"}</p><div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-slate-950 p-3"><strong className="block text-lg text-white">{survey.circuits.length}</strong><span className="text-slate-500">Circuits</span></div><div className="rounded-xl bg-slate-950 p-3"><strong className="block text-lg text-white">{survey.defects.length}</strong><span className="text-slate-500">Defects</span></div><div className="rounded-xl bg-slate-950 p-3"><strong className="block text-lg text-white">{survey.healthScore}%</strong><span className="text-slate-500">Health</span></div></div><div className="mt-4 flex flex-wrap gap-2"><Link href={`/surveys/${survey.id}`} className="inline-flex min-h-11 items-center rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-100 hover:bg-slate-800">Open survey</Link><Link href={`/surveys/${survey.id}/assist`} className="inline-flex min-h-11 items-center rounded-xl bg-cyan-400 px-4 text-sm font-semibold text-slate-950 hover:bg-cyan-300"><Sparkles className="mr-2 size-4" />JR Assist</Link></div></Card>;
    })}</div>}
  </div>;
}