import { readFileSync, writeFileSync } from "node:fs";

const path = "app/field/page.tsx";
let source = readFileSync(path, "utf8");

function replaceOnce(label, before, after) {
  const first = source.indexOf(before);
  const last = source.lastIndexOf(before);
  if (first < 0 || first !== last) throw new Error(`${label}: expected exactly one match`);
  source = `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
}

replaceOnce(
  "timer helper import",
  'import { isJobInactiveStatus, isJobOnSiteStatus, normaliseJobStatus, siteDiaryTimelineEntry, transitionJobStatus } from "../../lib/jobManagement-core.mjs";\n',
  'import { canStopFieldTimer, fieldTimerStartBlock, fieldTimerState } from "../../lib/fieldTimer-core.mjs";\nimport { isJobInactiveStatus, isJobOnSiteStatus, normaliseJobStatus, siteDiaryTimelineEntry, transitionJobStatus } from "../../lib/jobManagement-core.mjs";\n',
);

replaceOnce(
  "active timer state",
  '  const activeJob = jobs.items.find((job) => job.id === form.jobId);\n  const todaysEntries = diary.items.filter((entry) => entry.workDate === today());\n',
  '  const activeJob = jobs.items.find((job) => job.id === form.jobId);\n  const activeTimer = fieldTimerState(form);\n  const activeTimerJob = activeTimer.jobId ? jobs.items.find((job) => job.id === activeTimer.jobId) : undefined;\n  const timerLocked = activeTimer.state !== "idle";\n  const todaysEntries = diary.items.filter((entry) => entry.workDate === today());\n',
);

replaceOnce(
  "start and stop handlers",
  `  function startJob(job: Job) {
    if (cloudFieldMode && !operatorName) return setMessage("Your active team identity could not be resolved. Refresh your account before starting work.");
    if (cloudFieldMode && jobStatusSyncBlocked(job.id)) return setMessage(jobStatusSyncMessages[jobStatusSyncState(job.id)!]);
    const startedAt = nowTime();
    setForm((current) => ({ ...current, jobId: job.id, workDate: today(), startedAt: current.jobId === job.id && current.startedAt ? current.startedAt : startedAt, finishedAt: "" }));
    if (normaliseJobStatus(job.status) === "Scheduled") {
      const transitionApplied = updateJobStatus(job.id, "First fix");
      if (!transitionApplied) return;
    }
    setMessage(cloudFieldMode
      ? \`Work timer for \${job.title} started on this device at \${startedAt}.\`
      : \`\${job.title} started at \${startedAt}.\`);
  }

  function stopJob(job: Job) {
    const finishedAt = nowTime();
    setForm((current) => ({ ...current, jobId: job.id, finishedAt }));
    setMessage(\`\${job.title} stopped at \${finishedAt}. Add the site record below.\`);
  }
`,
  `  function startJob(job: Job) {
    if (cloudFieldMode && !operatorName) return setMessage("Your active team identity could not be resolved. Refresh your account before starting work.");
    if (cloudFieldMode && jobStatusSyncBlocked(job.id)) return setMessage(jobStatusSyncMessages[jobStatusSyncState(job.id)!]);
    const startBlock = fieldTimerStartBlock(form, job.id);
    if (startBlock === "already-running") return setMessage(\`The timer for \${job.title} is already running.\`);
    if (startBlock === "stop-current") return setMessage(\`Stop \${activeTimerJob?.title ?? "the current job"} before starting another timer.\`);
    if (startBlock === "save-current") return setMessage(\`Save the current site record for \${activeTimerJob?.title ?? "the selected job"} before starting another timer.\`);
    const startedAt = nowTime();
    setForm((current) => ({ ...current, jobId: job.id, workDate: today(), startedAt, finishedAt: "" }));
    if (normaliseJobStatus(job.status) === "Scheduled") {
      const transitionApplied = updateJobStatus(job.id, "First fix");
      if (!transitionApplied) return;
    }
    setMessage(cloudFieldMode
      ? \`Work timer for \${job.title} started on this device at \${startedAt}.\`
      : \`\${job.title} started at \${startedAt}.\`);
  }

  function stopJob(job: Job) {
    if (!canStopFieldTimer(form, job.id)) {
      return setMessage(activeTimer.state === "running"
        ? \`Only \${activeTimerJob?.title ?? "the active job"}'s timer can be stopped.\`
        : "No job timer is currently running.");
    }
    const finishedAt = nowTime();
    setForm((current) => ({ ...current, finishedAt }));
    setMessage(\`\${job.title} stopped at \${finishedAt}. Add the site record below.\`);
  }
`,
);

replaceOnce("mobile timer clearance", '  return <div className="space-y-6">\n', '  return <div className="space-y-6 pb-28 sm:pb-0">\n');

replaceOnce(
  "job workspace action",
  '<Link href={`/jobs/${job.id}`} className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:border-cyan-400/50">Open job</Link>',
  '<Link href={`/jobs/${job.id}/workspace`} className="inline-flex min-h-12 items-center rounded-xl border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:border-cyan-400/50">Job workspace</Link>',
);

replaceOnce(
  "timer status and job controls",
  '<p className="mt-4 flex items-start gap-2 text-sm text-slate-400"><MapPin className="mt-0.5 size-4 shrink-0 text-cyan-400" />{job.siteAddress}</p><div className="mt-5 flex flex-wrap gap-2"><Button type="button" disabled={cloudFieldMode && (!operatorName || jobStatusSyncBlocked(job.id))} onClick={() => startJob(job)}><Play className="mr-2 size-4" />Start job</Button><Button type="button" variant="secondary" onClick={() => stopJob(job)}><Square className="mr-2 size-4" />Stop timer</Button><Link href="/field/testing" className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold hover:border-cyan-400/50">Testing</Link></div>',
  '<p className="mt-4 flex items-start gap-2 text-sm text-slate-400"><MapPin className="mt-0.5 size-4 shrink-0 text-cyan-400" />{job.siteAddress}</p>{activeTimer.jobId === job.id && activeTimer.state === "running" ? <p role="status" className="mt-3 flex items-center gap-2 text-sm font-semibold text-emerald-200"><Clock3 className="size-4" />Timer running since {activeTimer.startedAt}</p> : null}{activeTimer.jobId === job.id && activeTimer.state === "stopped" ? <p role="status" className="mt-3 flex items-center gap-2 text-sm font-semibold text-amber-200"><Clock3 className="size-4" />Timer stopped at {activeTimer.finishedAt}; save the site record before starting another job.</p> : null}<div className="mt-5 grid gap-2 sm:grid-cols-3">{canStopFieldTimer(form, job.id) ? <Button type="button" className="min-h-12" variant="secondary" onClick={() => stopJob(job)}><Square className="mr-2 size-4" />Stop timer</Button> : activeTimer.jobId === job.id && activeTimer.state === "stopped" ? <a href="#daily-job-diary" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950"><Wrench className="mr-2 size-4" />Save site record</a> : <Button type="button" className="min-h-12" disabled={timerLocked || (cloudFieldMode && (!operatorName || jobStatusSyncBlocked(job.id)))} onClick={() => startJob(job)}><Play className="mr-2 size-4" />Start job</Button>}<Link href="/field/testing" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold hover:border-cyan-400/50">Testing</Link></div>',
);

replaceOnce(
  "diary anchor",
  '<section className="space-y-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Site record</p>',
  '<section id="daily-job-diary" className="scroll-mt-6 space-y-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Site record</p>',
);

replaceOnce(
  "locked job selector",
  '<select required value={form.jobId} onChange={(event) => setForm({ ...form, jobId: event.target.value })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">',
  '<select required disabled={timerLocked} value={form.jobId} onChange={(event) => setForm({ ...form, jobId: event.target.value })} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm">',
);

replaceOnce(
  "locked job selector notice",
  '</select></label><InputField label="Work date"',
  '</select>{timerLocked ? <span className="text-xs font-normal text-amber-200">The job is locked while this timed site record is running or awaiting save.</span> : null}</label><InputField label="Work date"',
);

replaceOnce(
  "mobile diary save target",
  '<Button type="submit" disabled={cloudFieldMode && !operatorName}><Wrench className="mr-2 size-4" />',
  '<Button type="submit" className="min-h-12" disabled={cloudFieldMode && !operatorName}><Wrench className="mr-2 size-4" />',
);

const closing = "  </div>;\n}\n";
if (!source.endsWith(closing)) throw new Error("sticky timer: unexpected page ending");
source = `${source.slice(0, -closing.length)}    {activeTimer.state === "running" && activeTimerJob ? <div role="status" aria-live="polite" className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 rounded-2xl border border-emerald-400/30 bg-slate-950/95 p-3 shadow-2xl backdrop-blur-xl sm:hidden"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">Timer running · {activeTimer.startedAt}</p><p className="truncate font-semibold text-slate-100">{activeTimerJob.title}</p></div><Button type="button" className="min-h-12 shrink-0" variant="secondary" onClick={() => stopJob(activeTimerJob)}><Square className="mr-2 size-4" />Stop</Button></div></div> : null}\n${closing}`;

writeFileSync(path, source);
console.log("Applied the audited single-job mobile timer patch.");
