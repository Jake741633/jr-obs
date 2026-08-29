"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Plus, Search, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { useSurveysCollection } from "../../lib/cloud/coreBusinessCollections";
import { queueTargetSyncState } from "../../lib/cloud/repository-core.mjs";
import { activeSyncAuthorizationMatches, flushSyncQueue, getSyncQueue, type SyncAuthorizationContext, type SyncState } from "../../lib/cloud/repository";
import { useCloudIdentity } from "../../lib/cloud/useCloudIdentity";
import { makeId, useCloudLocalCollection } from "../../lib/storage";
import { confirmSurveyBeforeNavigation, fieldSurveyCreationAllowed, persistSurveyBeforeNavigation, surveyCreateSyncMessage, surveyCreationRequiresCloudConfirmation } from "../../lib/surveyCreation-core.mjs";
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
  const router = useRouter();
  const surveys = useSurveysCollection();
  const customers = useCloudLocalCollection<Customer>("jr-os-customers");
  const jobs = useCloudLocalCollection<Job>("jr-os-jobs");
  const identityState = useCloudIdentity();
  const fieldMode = identityState.mode !== "local" && identityState.identity?.role === "electrician";
  const [search, setSearch] = useState("");
  const [newSurveyJobId, setNewSurveyJobId] = useState("");
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [unconfirmedSurveyId, setUnconfirmedSurveyId] = useState("");
  const pendingAuthorizationRef = useRef<SyncAuthorizationContext | null>(null);
  const mountedRef = useRef(true);
  const operationGenerationRef = useRef(0);
  const creatingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      operationGenerationRef.current += 1;
      creatingRef.current = false;
    };
  }, []);

  function syncAuthorization(): SyncAuthorizationContext | null {
    const identity = identityState.identity;
    return identity ? {
      organisationId: identity.organisationId,
      userId: identity.userId,
      role: identity.role,
      customerSourceId: identity.customerSourceId,
    } : null;
  }

  function beginCreationOperation() {
    if (creatingRef.current) return null;
    creatingRef.current = true;
    operationGenerationRef.current += 1;
    setCreating(true);
    return operationGenerationRef.current;
  }

  function operationIsCurrent(expectedAuthorization: SyncAuthorizationContext | null, operationGeneration: number) {
    if (!mountedRef.current || operationGenerationRef.current !== operationGeneration) return false;
    return identityState.mode === "local"
      || (identityState.mode === "migration" && !expectedAuthorization)
      || Boolean(expectedAuthorization && activeSyncAuthorizationMatches(expectedAuthorization));
  }

  function finishCreationOperation(operationGeneration: number) {
    if (!mountedRef.current || operationGenerationRef.current !== operationGeneration) return;
    creatingRef.current = false;
    setCreating(false);
  }

  function surveyQueueState(surveyId: string) {
    return queueTargetSyncState(getSyncQueue(), {
      table: "cloud_collections",
      collectionKey: "jr-os-surveys",
      sourceId: surveyId,
    }, navigator.onLine) as SyncState;
  }

  async function retrySurveyConfirmation() {
    if (!unconfirmedSurveyId || creatingRef.current) return;
    const expectedAuthorization = pendingAuthorizationRef.current;
    const operationGeneration = beginCreationOperation();
    if (operationGeneration === null) return;
    if (!operationIsCurrent(expectedAuthorization, operationGeneration)) {
      finishCreationOperation(operationGeneration);
      return;
    }
    setMessage("");
    try {
      const state = await confirmSurveyBeforeNavigation({
        flush: flushSyncQueue,
        isCurrent: () => operationIsCurrent(expectedAuthorization, operationGeneration),
        getSyncState: () => surveyQueueState(unconfirmedSurveyId),
        navigate: () => {
          const surveyId = unconfirmedSurveyId;
          pendingAuthorizationRef.current = null;
          setUnconfirmedSurveyId("");
          router.push(`/surveys/${surveyId}`);
        },
      });
      if (!operationIsCurrent(expectedAuthorization, operationGeneration)) return;
      if (state !== "Synced") setMessage(surveyCreateSyncMessage(state));
    } catch {
      if (!operationIsCurrent(expectedAuthorization, operationGeneration)) return;
      setMessage("Survey is saved on this device, but cloud confirmation could not finish. Check the connection and retry.");
    } finally {
      finishCreationOperation(operationGeneration);
    }
  }

  async function createSurvey() {
    if (creatingRef.current || unconfirmedSurveyId) return;
    const survey = blankSurvey(surveys.items.length);
    if (fieldMode) {
      const job = jobs.items.find((item) => item.id === newSurveyJobId);
      if (!job) {
        setMessage("Choose one of your assigned jobs before creating a field survey.");
        return;
      }
      survey.jobId = job.id;
      survey.customerId = job.customerId;
    }
    if (identityState.mode === "cloud" && !identityState.identity) {
      setMessage("Your cloud identity is not ready. Wait for account access to finish loading, then retry.");
      return;
    }
    if (!fieldSurveyCreationAllowed({ fieldMode, online: navigator.onLine })) {
      setMessage("Connect to the internet before creating a field survey. Assigned survey details are not retained offline.");
      return;
    }

    const expectedAuthorization = syncAuthorization();
    const operationGeneration = beginCreationOperation();
    if (operationGeneration === null) return;
    setMessage("");
    setUnconfirmedSurveyId(survey.id);
    pendingAuthorizationRef.current = expectedAuthorization;
    let persisted = false;
    try {
      const state = await persistSurveyBeforeNavigation({
        persist: () => {
          surveys.createItem(survey);
          persisted = true;
        },
        requiresCloudConfirmation: surveyCreationRequiresCloudConfirmation({
          mode: identityState.mode,
          online: navigator.onLine,
          authenticated: Boolean(expectedAuthorization),
        }),
        flush: flushSyncQueue,
        isCurrent: () => operationIsCurrent(expectedAuthorization, operationGeneration),
        getSyncState: () => surveyQueueState(survey.id),
        navigate: () => {
          pendingAuthorizationRef.current = null;
          setUnconfirmedSurveyId("");
          router.push(`/surveys/${survey.id}`);
        },
      });
      if (!operationIsCurrent(expectedAuthorization, operationGeneration)) return;
      if (state !== "Synced") setMessage(surveyCreateSyncMessage(state));
    } catch {
      if (!operationIsCurrent(expectedAuthorization, operationGeneration)) return;
      if (!persisted) {
        pendingAuthorizationRef.current = null;
        setUnconfirmedSurveyId("");
      }
      setMessage(persisted
        ? "Survey is saved on this device, but cloud confirmation could not finish. Check the connection and retry."
        : "Survey could not be saved safely on this device. No navigation occurred; check browser storage and retry.");
    } finally {
      finishCreationOperation(operationGeneration);
    }
  }

  const filtered = surveys.items.filter((survey) => {
    const customer = customers.items.find((item) => item.id === survey.customerId)?.name ?? "";
    const job = jobs.items.find((item) => item.id === survey.jobId)?.title ?? "";
    return `${survey.number} ${customer} ${job} ${survey.propertyType}`.toLowerCase().includes(search.toLowerCase());
  });

  if (!identityState.isReady || !surveys.isReady || !customers.isReady || !jobs.isReady) return <Card>Loading surveys…</Card>;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Site intelligence</p><h1 className="mt-1 text-3xl font-bold">Surveys</h1><p className="mt-2 text-sm text-slate-400">Capture the installation, defects, risks and recommendations before building a quote.</p></div>
      {!fieldMode ? <Button onClick={createSurvey} disabled={creating || Boolean(unconfirmedSurveyId)}><Plus className="mr-2 size-4" />{creating ? "Creating…" : "New survey"}</Button> : null}
    </div>

    {message ? <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100"><p>{message}</p>{unconfirmedSurveyId ? <Button variant="secondary" onClick={retrySurveyConfirmation} disabled={creating}>{creating ? "Confirming…" : "Retry cloud confirmation"}</Button> : null}</div> : null}

    {fieldMode ? <Card className="border-cyan-400/30"><div className="grid gap-3 md:grid-cols-[1fr_auto]"><label className="grid gap-2 text-sm font-medium text-slate-300"><span>Assigned job for new survey</span><select value={newSurveyJobId} disabled={creating || Boolean(unconfirmedSurveyId)} onChange={(event) => { setNewSurveyJobId(event.target.value); setMessage(""); }} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="">Choose assigned job</option>{jobs.items.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label><div className="flex items-end"><Button onClick={createSurvey} disabled={!newSurveyJobId || creating || Boolean(unconfirmedSurveyId)}><Plus className="mr-2 size-4" />{creating ? "Creating…" : "New field survey"}</Button></div></div><p className="mt-3 text-xs text-slate-400">Field surveys must be bound to an assigned job before the first cloud save.</p></Card> : null}

    <Card><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 size-5 text-slate-500" /><input aria-label="Search surveys" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search survey, customer or job" className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-3 text-white outline-none placeholder:text-slate-600 focus:border-cyan-400" /></div></Card>

    {filtered.length === 0 ? <Card><div className="grid place-items-center py-10 text-center"><ClipboardCheck className="size-10 text-slate-600" /><h2 className="mt-4 text-lg font-bold">No surveys found</h2><p className="mt-2 max-w-md text-sm text-slate-400">{fieldMode ? "Choose an assigned job above to create a field survey." : "Create your first survey and complete it from your phone while walking around the property."}</p></div></Card> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((survey) => {
      const customer = customers.items.find((item) => item.id === survey.customerId);
      const job = jobs.items.find((item) => item.id === survey.jobId);
      const awaitingCloudConfirmation = survey.id === unconfirmedSurveyId;
      return <Card key={survey.id} className="h-full"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{survey.number}</p><h2 className="mt-2 text-lg font-bold">{job?.title || `${survey.propertyType} survey`}</h2></div><StatusBadge status={survey.status} /></div><p className="mt-3 text-sm text-slate-400">{customer?.name || "No customer linked"}</p><div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-slate-950 p-3"><strong className="block text-lg text-white">{survey.circuits.length}</strong><span className="text-slate-500">Circuits</span></div><div className="rounded-xl bg-slate-950 p-3"><strong className="block text-lg text-white">{survey.defects.length}</strong><span className="text-slate-500">Defects</span></div><div className="rounded-xl bg-slate-950 p-3"><strong className="block text-lg text-white">{survey.healthScore}%</strong><span className="text-slate-500">Health</span></div></div><div className="mt-4 flex flex-wrap gap-2">{awaitingCloudConfirmation ? <span className="inline-flex min-h-11 items-center rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 text-sm font-semibold text-amber-100">Waiting for cloud confirmation</span> : <><Link href={`/surveys/${survey.id}`} className="inline-flex min-h-11 items-center rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-100 hover:bg-slate-800">Open survey</Link><Link href={`/surveys/${survey.id}/assist`} className="inline-flex min-h-11 items-center rounded-xl bg-cyan-400 px-4 text-sm font-semibold text-slate-950 hover:bg-cyan-300"><Sparkles className="mr-2 size-4" />JR Assist</Link></>}</div></Card>;
    })}</div>}
  </div>;
}
