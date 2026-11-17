import type { JobTimelineEntry } from "../../lib/models";
import { Button } from "../ui/Button";

export function SiteDiaryTimelineRetries({ notes, onRetry }: { notes: JobTimelineEntry[]; onRetry: (id: string) => void }) {
  if (!notes.length) return null;
  return <div className="space-y-3 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm text-amber-100">
    <p role="status" className="font-semibold">Timeline note needs retrying</p>
    <p>The diary is saved on this device. Keep this page open while you retry the note.</p>
    {notes.map(note => <div key={note.id} className="space-y-2 border-t border-amber-400/20 pt-3">
      <p className="break-words">{note.note}</p>
      <Button type="button" variant="secondary" className="min-h-12" onClick={() => onRetry(note.id)}>Retry timeline note</Button>
    </div>)}
  </div>;
}
