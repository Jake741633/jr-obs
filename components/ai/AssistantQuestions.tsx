"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { answerAssistantQuestion } from "../../lib/assistantQuestions";
import type { AssistantAction, AssistantRecords } from "../../lib/assistantBriefing";
import { Card } from "../ui/Card";

const shortcuts = [
  ["Today", "What is booked today?"], ["Tomorrow", "What is booked tomorrow?"], ["Overdue money", "How much is overdue?"],
  ["Quote follow-ups", "Which quotes need chasing?"], ["Site preparation", "Am I ready for site?"], ["Next seven days", "Show my diary next 7 days"],
  ["Open tasks", "Show my open tasks"], ["Open snags", "Show my open snags"],
];

export function AssistantQuestions({ records, now, briefing }: { records: AssistantRecords; now: Date; briefing: { today: string; actions: AssistantAction[] } }) {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const [limit, setLimit] = useState(4);
  const inputRef = useRef<HTMLInputElement>(null);
  const answer = useMemo(() => answerAssistantQuestion(records, asked, now, briefing), [records, asked, now, briefing]);
  function ask(value: string) { setQuestion(value); setAsked(value.trim()); setLimit(4); inputRef.current?.blur(); }
  return <Card className="border-cyan-400/20">
    <h2 className="text-lg font-bold">Ask JR AI</h2>
    <p className="mt-1 text-sm text-slate-400">Quick answers from your loaded records. Choose a question or ask about your diary, unpaid invoices, quote follow-ups, tasks or site preparation.</p>
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{shortcuts.map(([label, value]) => <button key={label} type="button" aria-pressed={asked === value} onClick={() => ask(value)} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-left text-sm font-semibold text-cyan-100 focus-visible:outline-2 focus-visible:outline-cyan-400">{label}</button>)}</div>
    <form className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={(event) => { event.preventDefault(); ask(question); }}>
      <label className="min-w-0 flex-1 text-sm font-semibold"><span>Your question</span><input ref={inputRef} type="text" maxLength={180} autoComplete="off" enterKeyHint="send" value={question} onChange={(event) => { setQuestion(event.target.value); setAsked(""); setLimit(4); }} placeholder="For example: How much am I owed?" className="mt-2 min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base focus:border-cyan-400 focus:outline-none" /></label>
      <button type="submit" disabled={!question.trim()} className="min-h-12 rounded-xl bg-cyan-400 px-5 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">Ask</button>
    </form>
    {answer ? <section aria-label="JR AI answer" className="mt-5 space-y-3 border-t border-slate-700 pt-4">
      <div role="status"><h3 className="text-lg font-bold">{answer.title}</h3><p className="mt-1 text-sm text-cyan-100">{answer.summary}</p></div>
      <p className="text-sm leading-6 text-slate-400">{answer.scope}</p>
      {answer.warnings.map((warning) => <p key={warning} className="rounded-xl bg-amber-400/10 p-3 text-sm text-amber-200">{warning}</p>)}
      {answer.items.slice(0, limit).map((item) => <div key={item.id} className="min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-3">
        <h4 className="break-words font-semibold">{item.title}</h4><p className="mt-2 break-words text-sm leading-6 text-slate-300">{item.detail}</p>
        <details className="mt-2"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-slate-400">Source details</summary><ul className="list-disc space-y-1 break-words pl-4 text-sm text-slate-400">{item.evidence.map((fact, index) => <li key={index}>{fact}</li>)}</ul></details>
        <Link href={item.href} className="mt-2 flex min-h-12 items-center rounded-xl border border-cyan-400/30 px-3 text-sm font-semibold text-cyan-200">{item.actionLabel}</Link>
      </div>)}
      {answer.items.length > limit ? <button type="button" onClick={() => setLimit((value) => value + 4)} className="min-h-12 w-full rounded-xl border border-slate-700 text-sm font-semibold">Show more records ({answer.items.length - limit} remaining)</button> : null}
      <p className="text-xs leading-5 text-slate-500">Local rules only. Missing or unsynced records can change the answer. Review the source before acting; JR AI has not changed or sent anything.</p>
      <button type="button" onClick={() => { setQuestion(""); setAsked(""); setLimit(4); }} className="min-h-11 text-sm font-semibold text-slate-400">Clear answer</button>
    </section> : null}
  </Card>;
}
