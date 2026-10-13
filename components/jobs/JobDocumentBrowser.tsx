"use client";

import Image from "next/image";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "../ui/Button";
import { InputField } from "../ui/FormField";
import { savedIdentityIndex } from "../../lib/assistantIdentity";
import { canEditFinance } from "../../lib/cloud/permissions";
import type { useCloudIdentity } from "../../lib/cloud/useCloudIdentity";
import type { PrivateFileBackedRecord } from "../../lib/cloud/privateFiles";
import type { JobDocument } from "../../lib/models";
import { photoPreviewSource } from "../../lib/jobPhotoEvidence";
export { photoPreviewSource } from "../../lib/jobPhotoEvidence";

const PAGE_SIZE = 8;
type DocumentFilter = "all" | "photos" | "other";

function uploadedTime(value: string) {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : -Infinity;
}

export function jobDocumentDateLabel(value: string) {
  return Number.isFinite(uploadedTime(value))
    ? new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
    : "Date unavailable";
}

export function jobDocumentSelection(documents: JobDocument[], jobId: string) {
  // Check the complete collection: a duplicate in another job is still ambiguous.
  const index = savedIdentityIndex(documents);
  const records = index.selectable.filter(item => item.jobId === jobId)
    .toSorted((a, b) => uploadedTime(b.uploadedAt) - uploadedTime(a.uploadedAt));
  return { records, withheld: documents.filter(item => item.jobId === jobId).length - records.length };
}

export function JobDocumentBrowser({ documents, jobId, children }: {
  documents: JobDocument[];
  jobId: string;
  children: (records: JobDocument[]) => ReactNode;
}) {
  const [query, setQuery] = useState(""), [filter, setFilter] = useState<DocumentFilter>("all"), [limit, setLimit] = useState(PAGE_SIZE);
  const { records, withheld } = useMemo(() => jobDocumentSelection(documents, jobId), [documents, jobId]);
  const matching = useMemo(() => {
    const words = query.trim().toLocaleLowerCase("en-GB").split(/\s+/).filter(Boolean);
    return records.filter(record => {
      if (filter === "photos" && record.category !== "Photo") return false;
      if (filter === "other" && record.category === "Photo") return false;
      const searchable = [record.name, record.fileName, record.notes, record.uploadedBy, record.category].join(" ").toLocaleLowerCase("en-GB");
      return words.every(word => searchable.includes(word));
    });
  }, [records, query, filter]);
  const shown = matching.slice(0, limit), filtered = Boolean(query || filter !== "all");
  return <div className="space-y-4">
    {withheld ? <p role="status" className="rounded-xl border border-amber-700/50 bg-amber-950/30 p-3 text-sm text-amber-200">{withheld} {withheld === 1 ? "record needs" : "records need"} source review because a saved document ID is missing or duplicated. Those records are hidden here.</p> : null}
    {records.length ? <>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <InputField label="Search job documents" type="search" maxLength={256} value={query} placeholder="Photo name, notes or filename" onChange={event => { setQuery(event.target.value); setLimit(PAGE_SIZE); }} />
        <label className="grid gap-2 text-sm font-semibold text-slate-300"><span>Record type</span><select value={filter} onChange={event => { setFilter(event.target.value as DocumentFilter); setLimit(PAGE_SIZE); }} className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base"><option value="all">All records</option><option value="photos">Photos</option><option value="other">Other documents and links</option></select></label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-sm text-slate-400">Showing {shown.length} of {matching.length} {filtered ? "matching " : ""}documents{withheld ? " with usable saved IDs" : ""}.</p>{filtered ? <Button type="button" variant="secondary" onClick={() => { setQuery(""); setFilter("all"); setLimit(PAGE_SIZE); }}>Clear filters</Button> : null}</div>
    </> : null}
    {shown.length ? children(shown) : <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5"><h3 className="font-semibold">{records.length ? "No matching documents" : withheld ? "No documents with usable saved IDs" : "No uploaded documents yet"}</h3><p className="mt-1 text-sm text-slate-400">{records.length ? "Try another search or clear the filters." : withheld ? "Review the saved source records before using this job folder." : "Saved site photos, certificates, drawings and links will appear here."}</p></div>}
    {shown.length < matching.length ? <Button type="button" variant="secondary" className="min-h-12 w-full" onClick={() => setLimit(current => current + PAGE_SIZE)}>Show more documents</Button> : null}
  </div>;
}


export function JobPhotoPreview({ document, identityState: identity }: {
  document: JobDocument & Pick<PrivateFileBackedRecord, "signedDownloadUrl">;
  identityState: Pick<ReturnType<typeof useCloudIdentity>, "identity" | "isReady" | "mode">;
}) {
  const [failedSource, setFailedSource] = useState(""), [expandedSource, setExpandedSource] = useState("");
  // Field links still require a fresh capability when opened; don't add cached previews.
  if (!identity.isReady || (identity.mode !== "local" && !canEditFinance(identity.identity?.role)) || document.category !== "Photo") return null;
  const source = photoPreviewSource(document, typeof window === "undefined" ? "" : window.location.origin);
  if (!source || failedSource === source) return <p className="mt-3 text-sm text-slate-400">Photo preview unavailable. Use the document action below if available, or check sync status.</p>;
  const expanded = expandedSource === source;
  return <div className="mt-3 space-y-2">
    <Image unoptimized width={1600} height={1200} src={source} alt={document.name || "Saved site photo"} loading="lazy" onError={() => setFailedSource(source)} className={`w-full rounded-xl bg-slate-950 object-contain ${expanded ? "max-h-[75vh]" : "h-40"}`} />
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="secondary" aria-expanded={expanded} className="min-h-12" onClick={() => setExpandedSource(expanded ? "" : source)}>{expanded ? "Show thumbnail" : "View larger photo"}</Button>
      {!document.dataUrl ? <a href={source} download={document.fileName || document.name} className="inline-flex min-h-12 items-center rounded-lg border border-slate-700 px-3 text-sm text-slate-200 hover:border-cyan-400/50">Download photo</a> : null}
    </div>
  </div>;
}
