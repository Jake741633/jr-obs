"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChangeEvent, useMemo, useState } from "react";
import { ArrowLeft, Camera, Check, ImagePlus, Sparkles } from "lucide-react";
import { Button } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { useSurveysCollection } from "../../../../lib/cloud/coreBusinessCollections";
import { useCloudIdentity } from "../../../../lib/cloud/useCloudIdentity";
import { makeId } from "../../../../lib/storage";
import { interpretSurveyTranscript } from "../../../../lib/surveyAssist";
import type { SiteSurvey, SurveyPhoto } from "../../../../lib/models";

const fieldClass = "min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-white outline-none focus:border-cyan-400";
const fieldPhotoHandoffMessage = "Board photo uploads are read-only for field users until a dedicated assigned-job upload route is available. Ask the office to add new survey photos.";

export default function SurveyAssistPage() {
  const { id } = useParams<{ id: string }>();
  const surveys = useSurveysCollection();
  const identityState = useCloudIdentity();
  const fieldPhotoRestricted = identityState.mode !== "local" && identityState.identity?.role === "electrician";
  const [transcript, setTranscript] = useState("");
  const [saved, setSaved] = useState("");
  const survey = surveys.items.find((item) => item.id === id);
  const draft = useMemo(() => interpretSurveyTranscript(transcript), [transcript]);

  if (!surveys.isReady) return <Card>Loading JR Assist…</Card>;
  if (!survey) return <Card>Survey not found.</Card>;

  function update(patch: Partial<SiteSurvey>) {
    surveys.setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item));
  }

  function applySuggestions() {
    if (!survey) return;
    update({
      ...draft.consumerUnit,
      voiceNotes: [survey.voiceNotes, transcript].filter(Boolean).join("\n\n"),
      defects: Array.from(new Set([...survey.defects, ...draft.defects])),
      risks: Array.from(new Set([...survey.risks, ...draft.risks])),
      recommendations: Array.from(new Set([...survey.recommendations, ...draft.recommendations])),
      status: survey.status === "Draft" ? "In progress" : survey.status,
    });
    setSaved("Suggestions applied to the survey. Review every field before completion.");
  }

  function addBoardPhoto(event: ChangeEvent<HTMLInputElement>) {
    if (fieldPhotoRestricted) {
      event.target.value = "";
      return;
    }
    const file = event.target.files?.[0];
    if (!file || !survey) return;
    if (!file.type.startsWith("image/")) {
      setSaved("Please select an image file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const photo: SurveyPhoto = {
        id: makeId("survey-photo"),
        name: file.name,
        category: "Consumer unit",
        dataUrl: typeof reader.result === "string" ? reader.result : undefined,
        note: "Board photo captured for inspector review and future AI vision extraction.",
        severity: "Low",
      };
      update({ photos: [...survey.photos, photo] });
      setSaved("Board photo added. The current build stores it for review; cloud AI extraction will be connected in a later phase.");
      event.target.value = "";
    };
    reader.readAsDataURL(file);
  }

  return <div className="space-y-6">
    <Link href={`/surveys/${id}`} className="inline-flex items-center gap-2 text-sm text-cyan-300"><ArrowLeft className="size-4" />Back to survey</Link>

    <Card className="border-cyan-400/30">
      <div className="flex items-start gap-3"><Sparkles className="mt-1 size-7 text-cyan-400" /><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">JR Assist</p><h1 className="mt-1 text-3xl font-bold">Survey voice and vision assistant</h1><p className="mt-2 text-sm text-slate-400">Turn a spoken walkthrough into editable draft survey information and capture board photos for review.</p></div></div>
    </Card>

    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <h2 className="text-xl font-bold">Voice walkthrough</h2>
        <p className="mt-2 text-sm text-slate-400">Use your phone’s keyboard microphone to dictate, or type what you see. Nothing is applied until you approve it.</p>
        <textarea className={`${fieldClass} mt-4 min-h-48 py-3`} value={transcript} onChange={(event) => { setTranscript(event.target.value); setSaved(""); }} placeholder="Example: Hager 12-way metal board, RCBOs fitted, no SPD, gas bonding not visible, signs of overheating on one neutral and asbestos suspected in the cupboard…" />
        <div className="mt-4 flex flex-wrap items-center gap-3"><Button onClick={applySuggestions} disabled={!transcript.trim()}><Sparkles className="mr-2 size-4" />Apply approved draft</Button><span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-300">Confidence: {draft.confidence}</span></div>
        {saved ? <p className="mt-4 flex items-start gap-2 text-sm text-emerald-300"><Check className="mt-0.5 size-4 shrink-0" />{saved}</p> : null}
      </Card>

      <Card>
        <h2 className="text-xl font-bold">Suggested survey data</h2>
        <p className="mt-2 text-sm text-amber-300">Inspector review required. These are workflow suggestions, not a substitute for inspection, testing or professional judgement.</p>
        <div className="mt-5 space-y-4">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Consumer unit</p><div className="mt-2 grid gap-2 text-sm">{Object.entries(draft.consumerUnit).length ? Object.entries(draft.consumerUnit).map(([key, value]) => <div key={key} className="rounded-xl bg-slate-950 p-3"><span className="text-slate-500">{key}: </span><span>{String(value)}</span></div>) : <p className="text-slate-500">No board details recognised yet.</p>}</div></div>
          <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Defects</p><p className="mt-2 text-sm text-slate-300">{draft.defects.join(" · ") || "None recognised"}</p></div>
          <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Risks</p><p className="mt-2 text-sm text-slate-300">{draft.risks.join(" · ") || "None recognised"}</p></div>
          <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Recommended works</p><div className="mt-2 space-y-2">{draft.recommendations.length ? draft.recommendations.map((item) => <div key={item} className="rounded-xl bg-slate-950 p-3 text-sm">{item}</div>) : <p className="text-sm text-slate-500">No recommendations generated yet.</p>}</div></div>
          {draft.notes.map((note) => <p key={note} className="text-xs text-slate-500">{note}</p>)}
        </div>
      </Card>
    </div>

    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-3"><Camera className="size-6 text-cyan-400" /><h2 className="text-xl font-bold">Consumer-unit photos</h2></div><p className="mt-2 text-sm text-slate-400">{fieldPhotoRestricted ? "Existing assigned survey photos remain available to review." : "Take a clear front-on photo and, where safe, a separate close-up of labels and protective devices."}</p></div>{fieldPhotoRestricted ? <p className="max-w-md text-sm text-amber-200">{fieldPhotoHandoffMessage}</p> : <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-cyan-400 px-4 text-sm font-semibold text-slate-950 hover:bg-cyan-300"><ImagePlus className="mr-2 size-4" />Add board photo<input className="hidden" type="file" accept="image/*" capture="environment" onChange={addBoardPhoto} /></label>}</div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{survey.photos.filter((photo) => photo.category === "Consumer unit").map((photo) => <div key={photo.id} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">{photo.dataUrl ? <div className="relative aspect-square"><Image src={photo.dataUrl} alt={photo.name} fill unoptimized sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" className="object-cover" /></div> : <div className="grid aspect-square place-items-center text-slate-600"><Camera className="size-8" /></div>}<div className="p-3"><p className="truncate text-sm font-semibold">{photo.name}</p><p className="mt-1 text-xs text-slate-500">{photo.note}</p></div></div>)}{survey.photos.filter((photo) => photo.category === "Consumer unit").length === 0 ? <p className="text-sm text-slate-500">No board photos added yet.</p> : null}</div>
    </Card>
  </div>;
}
