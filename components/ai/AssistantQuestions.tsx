"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { answerAssistantQuestion, assistantQuestionIntent, assistantJobFollowUpIntent } from "../../lib/assistantQuestions";
import type { AssistantAction, AssistantRecords } from "../../lib/assistantBriefing";
import { Card } from "../ui/Card";
import { assistantJobFromLink } from "../../lib/assistantJobLink";
import { assistantJobIdentityIndex } from "../../lib/assistantIdentity";

const shortcuts = [
  ["Today", "What is booked today?"], ["Tomorrow", "What is booked tomorrow?"], ["Overdue money", "How much is overdue?"],
  ["Quote follow-ups", "Which quotes need chasing?"], ["Site preparation", "Am I ready for site?"], ["Next seven days", "Show my diary next 7 days"],
  ["Job briefing", "Show job briefing"], ["Open tasks", "Show my open tasks"], ["Open snags", "Show my open snags"],
  ["Next visit checks", "Which jobs need another visit?"],
  ["Materials to order", "Which materials need ordering?"], ["Awaiting deliveries", "Show awaiting deliveries"],
];
const primaryQuestions = new Set(["Today", "Tomorrow", "Job briefing", "Materials to order"]);

const jobFollowUps = [
  ["Job summary", "Show job briefing"], ["Job tasks", "Show my open tasks"], ["Job snags", "Show my open snags"],
  ["Job materials", "Which materials need ordering?"], ["Job deliveries", "Show awaiting deliveries"], ["Next work visit", "Which jobs need another visit?"],
];

export function AssistantQuestions({ records, now, briefing, canOpenTaskWorkspace }: { records: AssistantRecords; now: Date; briefing: { today: string; actions: AssistantAction[] }; canOpenTaskWorkspace: boolean }) {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const [limit, setLimit] = useState(4);
  const [scopeJobId, setScopeJobId] = useState("");
  const [askedJobId, setAskedJobId] = useState("");
  const [linkNotice, setLinkNotice] = useState("");
  const [interactionVersion, setInteractionVersion] = useState(0);
  const interactionRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const jobIdentities = useMemo(() => assistantJobIdentityIndex(records.jobs), [records.jobs]);
  useEffect(() => {
    const requested = assistantJobFromLink(window.location.search);
    if (!requested) return;
    const frame = window.requestAnimationFrame(() => {
      if (interactionRef.current !== 0) return;
      setInteractionVersion(++interactionRef.current);
      const jobId = requested.jobId || "";
      setScopeJobId(jobId); setAskedJobId(jobId);
      setQuestion("Show job briefing"); setAsked("Show job briefing"); setLimit(4);
      if (!requested.jobId) setLinkNotice("This job briefing link is invalid. Choose a loaded job before reviewing its records.");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const answer = useMemo(() => answerAssistantQuestion(records, asked, now, briefing, askedJobId, canOpenTaskWorkspace), [records, asked, now, briefing, askedJobId, canOpenTaskWorkspace]);
  function advanceInteraction() { setInteractionVersion(++interactionRef.current); }
  function ask(value: string, followUpJobId?: string) {
    if (interactionVersion !== interactionRef.current) return;
    advanceInteraction();
    setLinkNotice("");
    const intent = assistantJobFollowUpIntent(value) ?? assistantQuestionIntent(value);
    const requestedJobId = intent === "tasks" || intent === "snags" || intent === "job" || intent === "visits" || intent === "materials" || intent === "deliveries" ? followUpJobId ?? scopeJobId : "";
    const initialAnswer = answerAssistantQuestion(records, value, now, briefing, requestedJobId, canOpenTaskWorkspace);
    setAskedJobId(initialAnswer?.resolvedJobId || requestedJobId);
    if (initialAnswer?.resolvedJobId) setScopeJobId(initialAnswer.resolvedJobId);
    else if (initialAnswer?.jobChoices && !requestedJobId) setScopeJobId("");
    setQuestion(value); setAsked(value.trim()); setLimit(4); inputRef.current?.blur();
  }
  function shortcutButton([label, value]: string[]) {
    return <button key={label} type="button" aria-pressed={asked === value} onClick={() => ask(value)} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-left text-sm font-semibold text-cyan-100 focus-visible:outline-2 focus-visible:outline-cyan-400">{label}</button>;
  }
  return <Card className="border-cyan-400/20">
    <h2 className="text-lg font-bold">Ask JR AI</h2>
    <p className="mt-1 text-sm text-slate-400">Read-only answers from your loaded records. Type a supported question or choose one below.</p>
    <form className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={(event) => { event.preventDefault(); ask(question); }}>
      <label className="min-w-0 flex-1 text-sm font-semibold"><span>Your question</span><input ref={inputRef} type="text" maxLength={180} autoComplete="off" enterKeyHint="send" value={question} onChange={(event) => { advanceInteraction(); setLinkNotice(""); setQuestion(event.target.value); setAsked(""); setLimit(4); }} placeholder="For example: How much am I owed?" className="mt-2 min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base focus:border-cyan-400 focus:outline-none" /></label>
      <button type="submit" disabled={!question.trim()} className="min-h-12 rounded-xl bg-cyan-400 px-5 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">Ask</button>
    </form>
    <label className="mt-4 block text-sm font-semibold">Job scope<select value={scopeJobId} onChange={(event) => { advanceInteraction(); setLinkNotice(""); setScopeJobId(event.target.value); setAsked(""); setAskedJobId(""); setLimit(4); }} className="mt-2 min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base"><option value="">All loaded jobs</option>{scopeJobId && !jobIdentities.uniqueJobs.has(scopeJobId) ? <option value={scopeJobId}>Selected job unavailable or ambiguous</option> : null}{jobIdentities.selectable.toSorted((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id)).map((job) => <option key={job.id} value={job.id}>{job.title} · {job.siteAddress || "No address"} · {job.status}</option>)}</select></label>
    {jobIdentities.unusableCount ? <p role="status" className="mt-2 rounded-xl bg-amber-400/10 p-3 text-sm text-amber-200">{jobIdentities.unusableCount} job record(s) have missing or duplicate identities and cannot be selected. Review Jobs before using those records.</p> : null}
    <details className="mt-2"><summary className="min-h-12 cursor-pointer py-3 text-sm font-semibold text-slate-400">How job scope works</summary><p className="text-xs leading-5 text-slate-400">Choose a job for Job briefing, Open tasks, Open snags, Next visit checks, Materials to order or Awaiting deliveries. You can also ask “Show tasks for”, “Show next visit checks for” or “Which materials need ordering for” followed by its full saved name or site address. A matched job stays selected for follow-ups such as “What about materials?”. Choose All loaded jobs or Clear answer to clear it. Diary, money, quotes and site-preparation shortcuts keep their normal scope.</p></details>
    <div role="group" aria-label="Quick questions" className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{shortcuts.filter(([label]) => primaryQuestions.has(label)).map(shortcutButton)}</div>
    <details className="mt-2"><summary className="min-h-12 cursor-pointer py-3 text-sm font-semibold text-cyan-200">More questions ({shortcuts.length - primaryQuestions.size})</summary><div role="group" aria-label="More quick questions" className="grid grid-cols-2 gap-2 sm:grid-cols-4">{shortcuts.filter(([label]) => !primaryQuestions.has(label)).map(shortcutButton)}</div></details>
    {linkNotice ? <p role="status" className="mt-4 rounded-xl bg-amber-400/10 p-3 text-sm text-amber-200">{linkNotice}</p> : null}
    {answer ? <section aria-label="JR AI answer" className="mt-5 space-y-3 border-t border-slate-700 pt-4">
      <div role="status"><h3 className="text-lg font-bold">{answer.title}</h3><p className="mt-1 text-sm text-cyan-100">{answer.summary}</p></div>
      <p className="text-sm leading-6 text-slate-400">{answer.scope}</p>
      {answer.warnings.map((warning) => <p key={warning} className="rounded-xl bg-amber-400/10 p-3 text-sm text-amber-200">{warning}</p>)}
      {answer.resolvedJobId ? <div role="group" aria-label="Follow up on this job" className="rounded-xl border border-cyan-400/20 p-3"><p className="break-words text-sm font-semibold">Continue with {jobIdentities.uniqueJobs.get(answer.resolvedJobId)?.title}</p><p className="mt-1 text-xs leading-5 text-slate-400">These answers stay on this exact saved job. No records are changed.</p><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{jobFollowUps.map(([label, value]) => <button key={label} type="button" onClick={() => ask(value, answer.resolvedJobId)} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-left text-sm font-semibold text-cyan-100">{label}</button>)}</div></div> : null}
      {answer.jobChoices?.slice(0, limit).map((job) => <div key={job.id} className="min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-3"><h4 className="break-words font-semibold">{job.title}</h4><p className="mt-2 break-words text-sm text-slate-400">{job.address || "Address not recorded"} · {job.status}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => { if (interactionVersion !== interactionRef.current) return; advanceInteraction(); setLinkNotice(""); setAskedJobId(job.id); setScopeJobId(job.id); setLimit(4); }} className="min-h-12 rounded-xl border border-cyan-400/30 px-3 text-sm font-semibold text-cyan-200">Use this job</button><Link href={`/jobs/${encodeURIComponent(job.id)}`} className="flex min-h-12 items-center px-3 text-sm font-semibold text-slate-400">Review job details</Link></div></div>)}
      {answer.jobChoices && answer.jobChoices.length > limit ? <button type="button" onClick={() => setLimit((value) => value + 4)} className="min-h-12 w-full rounded-xl border border-slate-700 text-sm font-semibold">Show more jobs ({answer.jobChoices.length - limit} remaining)</button> : null}
      {answer.items.slice(0, limit).map((item) => <div key={item.id} className="min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-3">
        <h4 className="break-words font-semibold">{item.title}</h4><p className="mt-2 break-words text-sm leading-6 text-slate-300">{item.detail}</p>
        <details className="mt-2"><summary className="min-h-12 cursor-pointer py-3 text-sm font-semibold text-slate-400">Source details</summary><ul className="list-disc space-y-1 break-words pl-4 text-sm text-slate-400">{item.evidence.map((fact, index) => <li key={index}>{fact}</li>)}</ul></details>
        <Link href={item.href} className="mt-2 flex min-h-12 items-center rounded-xl border border-cyan-400/30 px-3 text-sm font-semibold text-cyan-200">{item.actionLabel}</Link>
      </div>)}
      {answer.items.length > limit ? <button type="button" onClick={() => setLimit((value) => value + 4)} className="min-h-12 w-full rounded-xl border border-slate-700 text-sm font-semibold">Show more records ({answer.items.length - limit} remaining)</button> : null}
      <p className="text-xs leading-5 text-slate-500">Local rules only. Missing or unsynced records can change the answer. Review the source before acting; JR AI has not changed or sent anything.</p>
      <button type="button" onClick={() => { advanceInteraction(); setLinkNotice(""); setQuestion(""); setAsked(""); setScopeJobId(""); setAskedJobId(""); setLimit(4); }} className="min-h-12 text-sm font-semibold text-slate-400">Clear answer</button>
    </section> : null}
  </Card>;
}
