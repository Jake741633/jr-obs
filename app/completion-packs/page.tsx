"use client";

import Link from "next/link";
import { Camera, CheckCircle2, FileCheck2, FileText, ReceiptText, UserRoundCheck } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { useLocalStorageCollection } from "../../lib/storage";
import type { Customer, Invoice, Job, JobDocument, JobTimelineEntry, SiteDiaryEntry } from "../../lib/models";

function formatDate(value?: string) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function CompletionPacksPage() {
  const jobs = useLocalStorageCollection<Job>("jr-os-jobs");
  const customers = useLocalStorageCollection<Customer>("jr-os-customers");
  const documents = useLocalStorageCollection<JobDocument>("jr-os-job-documents");
  const timeline = useLocalStorageCollection<JobTimelineEntry>("jr-os-job-timeline");
  const diary = useLocalStorageCollection<SiteDiaryEntry>("jr-os-site-diary");
  const invoices = useLocalStorageCollection<Invoice>("jr-os-invoices");

  const ready = [jobs, customers, documents, timeline, diary, invoices].every((store) => store.isReady);
  if (!ready) return <Card>Preparing completion packs…</Card>;

  const customerNames = new Map(customers.items.map((customer) => [customer.id, customer.name]));
  const completedJobs = jobs.items
    .filter((job) => job.status === "Complete")
    .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));

  const invoiceReady = completedJobs.filter((job) =>
    !invoices.items.some((invoice) => invoice.jobId === job.id && invoice.status !== "Cancelled"),
  ).length;

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="Job handover"
        title="Completion packs"
        description="Review site records, handover evidence and invoice readiness after work is marked complete."
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-slate-400">Completed jobs</p>
          <p className="mt-2 text-3xl font-bold text-white">{completedJobs.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Ready to invoice</p>
          <p className="mt-2 text-3xl font-bold text-emerald-300">{invoiceReady}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Completion photos</p>
          <p className="mt-2 text-3xl font-bold text-cyan-300">
            {documents.items.filter((document) => document.category === "Photo").length}
          </p>
        </Card>
      </section>

      {completedJobs.length === 0 ? (
        <Card>
          <div className="flex items-start gap-3">
            <FileCheck2 className="mt-0.5 size-5 text-slate-500" />
            <div>
              <h2 className="font-semibold text-white">No completion packs yet</h2>
              <p className="mt-1 text-sm text-slate-400">Finish a job from the mobile workspace and its handover record will appear here.</p>
            </div>
          </div>
        </Card>
      ) : (
        <section className="grid gap-4 xl:grid-cols-2">
          {completedJobs.map((job) => {
            const jobDocuments = documents.items.filter((document) => document.jobId === job.id);
            const jobDiary = diary.items.filter((entry) => entry.jobId === job.id);
            const completionEntry = timeline.items
              .filter((entry) => entry.jobId === job.id && entry.milestone === "Job completed")
              .sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];
            const invoice = invoices.items.find((item) => item.jobId === job.id && item.status !== "Cancelled");
            const photos = jobDocuments.filter((document) => document.category === "Photo");
            const handoverDocuments = jobDocuments.filter((document) => document.category === "Handover");

            return (
              <Card key={job.id} className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                      {customerNames.get(job.customerId ?? "") || "Direct job"}
                    </p>
                    <h2 className="mt-1 text-xl font-bold text-white">{job.title}</h2>
                    <p className="mt-1 text-sm text-slate-400">Completed {formatDate(completionEntry?.completedAt || job.updatedAt)}</p>
                  </div>
                  <StatusBadge status={invoice ? invoice.status : "Ready to invoice"} />
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                    <Camera className="size-4 text-cyan-400" />
                    <p className="mt-2 text-lg font-bold">{photos.length}</p>
                    <p className="text-xs text-slate-500">Photos</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                    <FileText className="size-4 text-cyan-400" />
                    <p className="mt-2 text-lg font-bold">{jobDiary.length}</p>
                    <p className="text-xs text-slate-500">Site records</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                    <UserRoundCheck className="size-4 text-cyan-400" />
                    <p className="mt-2 text-lg font-bold">{completionEntry ? "Yes" : "No"}</p>
                    <p className="text-xs text-slate-500">Sign-off</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                    <FileCheck2 className="size-4 text-cyan-400" />
                    <p className="mt-2 text-lg font-bold">{handoverDocuments.length}</p>
                    <p className="text-xs text-slate-500">Handover files</p>
                  </div>
                </div>

                {completionEntry ? (
                  <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                      <CheckCircle2 className="size-4" /> Completion recorded
                    </div>
                    <p className="mt-2 text-sm text-slate-300">{completionEntry.note}</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200">
                    Job is marked complete but no customer handover timeline entry was found.
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Link href={`/jobs/${job.id}`} className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-300">
                    Open job pack
                  </Link>
                  {invoice ? (
                    <Link href="/invoices" className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-cyan-400/50">
                      <ReceiptText className="mr-2 inline size-4" />View {invoice.number}
                    </Link>
                  ) : (
                    <Link href="/ai" className="rounded-lg border border-emerald-400/30 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-400/10">
                      <ReceiptText className="mr-2 inline size-4" />Create invoice
                    </Link>
                  )}
                  <Link href="/field" className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-cyan-400/50">
                    Mobile workspace
                  </Link>
                </div>
              </Card>
            );
          })}
        </section>
      )}
    </main>
  );
}
