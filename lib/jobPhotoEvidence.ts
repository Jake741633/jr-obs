import type { JobDocument } from "./models";
import type { PrivateFileBackedRecord } from "./cloud/privateFiles";

export type SavedJobDocument = JobDocument & Pick<PrivateFileBackedRecord, "signedDownloadUrl" | "privateStoragePath" | "privateFileId">;

export function photoPreviewSource(document: SavedJobDocument, origin: string): string | null {
  if (document.category !== "Photo" || !["image/jpeg", "image/png", "image/webp"].includes(document.mimeType)) return null;
  const data = document.dataUrl;
  if (typeof data === "string" && data.length <= 3 * 1024 * 1024) {
    const prefix = `data:${document.mimeType};base64,`;
    if (data.startsWith(prefix)) {
      const bytes = data.slice(prefix.length);
      if (bytes.length && bytes.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(bytes)) return data;
    }
  }
  // Borrow only a blob created by the existing authenticated private-file bridge.
  // Never fetch an externalUrl or turn a stored HTTPS URL into an inline image.
  const downloaded = document.signedDownloadUrl;
  if (typeof downloaded !== "string" || !/^https?:\/\//.test(origin)) return null;
  const prefix = `blob:${origin}/`;
  if (!downloaded.startsWith(prefix) || !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(downloaded.slice(prefix.length))) return null;
  return downloaded;
}

/** Bind the reviewed saved text and, when selected, its exact private photo source. */
export function sameSavedJobEvidence(previous: SavedJobDocument, current: SavedJobDocument | undefined, withPhoto: boolean, origin: string) {
  if (!current || !previous.id?.trim()) return false;
  const textFields = ["id", "jobId", "name", "category", "notes", "uploadedAt", "uploadedBy", "createdAt"] as const;
  if (textFields.some(key => previous[key] !== current[key])) return false;
  if (!withPhoto) return true;
  const fileFields = ["mimeType", "fileName", "privateStoragePath", "privateFileId"] as const;
  const source = photoPreviewSource(previous, origin);
  return Boolean(source) && source === photoPreviewSource(current, origin) && fileFields.every(key => previous[key] === current[key]);
}

export function savedJobEvidenceNotes(notes: string, record: SavedJobDocument, withPhoto: boolean) {
  const savedNotes = typeof record.notes === "string" ? record.notes.trim() : "";
  if (!withPhoto && !savedNotes) throw new Error("This record has no saved notes to use.");
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const result = [notes.trim(), `Saved job evidence: ${name || "Unnamed record"}\n${withPhoto ? "Selected photo and recorded notes:" : "Recorded notes only; attachment not analysed:"}\n${savedNotes || "No saved notes."}`].filter(Boolean).join("\n\n");
  if (result.length > 12000) throw new Error("Keep the combined typed and saved notes under 12,000 characters. Shorten the notes or choose another record.");
  return result;
}

/** Reads only an already-authorised local image; the caller owns live account/source checks. */
export async function readSavedJobPhoto(record: SavedJobDocument, origin: string, signal: AbortSignal): Promise<File> {
  const check = () => { if (signal.aborted) throw new Error("Photo preparation was cancelled."); };
  check();
  const source = photoPreviewSource(record, origin);
  if (!source) throw new Error("This saved photo is unavailable. Check sync status or choose a supported JPEG, PNG or WebP photo.");
  let blob: Blob;
  if (source.startsWith("data:")) {
    const decoded = atob(source.slice(source.indexOf(",") + 1));
    blob = new Blob([Uint8Array.from(decoded, character => character.charCodeAt(0))], { type: record.mimeType });
  } else {
    const response = await fetch(source, { signal, credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer" });
    check();
    if (!response.ok || !response.body) throw new Error("The saved photo could not be read. Check sync status and select it again.");
    const mime = response.headers.get("Content-Type")?.split(";")[0].trim();
    if (mime !== record.mimeType) { await response.body.cancel(); throw new Error("The saved photo format changed. Select the current photo again."); }
    const maxBytes = 25 * 1024 * 1024;
    if (Number(response.headers.get("Content-Length")) > maxBytes) { await response.body.cancel(); throw new Error("Choose a saved photo under 25 MB."); }
    const reader = response.body.getReader(), chunks: ArrayBuffer[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); check();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) throw new Error("Choose a saved photo under 25 MB.");
        chunks.push(new Uint8Array(value).buffer);
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    finally { reader.releaseLock(); }
    if (!size) throw new Error("The saved photo is empty. Select another photo.");
    blob = new Blob(chunks, { type: mime });
  }
  check();
  // The bridge owns its object URL; never revoke it here.
  return new File([blob], record.fileName || "saved-site-photo", { type: record.mimeType });
}

