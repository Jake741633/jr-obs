import { photoFileError } from "./jobMediaCapture";

/** Validate the complete selection before replacing any existing evidence. */
export function quotePhotoSelectionError(files: File[], frameCount = 0): string | null {
  if (!Number.isInteger(frameCount) || frameCount < 0 || frameCount > 3 || files.length + frameCount > 6) {
    return "Use at most six images together. Each sampled video frame counts as one; remove a photo or the recording.";
  }
  for (const file of files) { const error = photoFileError(file); if (error) return error; }
  if (files.reduce((total, file) => total + file.size, 0) > 100 * 1024 * 1024) return "Keep the selected photos under 100 MB in total.";
  return null;
}

function photoStep<T>(signal: AbortSignal | undefined, start: (resolve: (value: T) => void, reject: (error: Error) => void) => (() => void) | void): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false, cleanup: (() => void) | void;
    const release = () => { const stop = cleanup; cleanup = undefined; stop?.(); };
    const finish = (error: Error | null, value?: T) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener("abort", cancel); release();
      if (error) reject(error); else resolve(value as T);
    };
    const cancel = () => finish(new Error("Photo preparation cancelled."));
    const timer = setTimeout(() => finish(new Error("Photo preparation took too long. Try a smaller JPEG or PNG.")), 12000);
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) { cancel(); return; }
    try {
      cleanup = start(value => finish(null, value), error => finish(error));
      if (settled) release();
    } catch (error) { finish(error instanceof Error ? error : new Error("This photo could not be prepared.")); }
  });
}

/** A transient AI copy; job-evidence storage keeps its separate larger allowance. */
export async function prepareQuotePhoto(file: File, signal?: AbortSignal): Promise<{ dataUrl: string; fileName: string; mimeType: string }> {
  const error = photoFileError(file); if (error) throw new Error(error);
  if (signal?.aborted) throw new Error("Photo preparation cancelled.");
  const sourceUrl = URL.createObjectURL(file), image = new Image();
  let canvas: HTMLCanvasElement | undefined;
  try {
    await photoStep<void>(signal, (resolve, reject) => {
      image.onload = () => resolve(); image.onerror = () => reject(new Error("This phone could not open the photo. Choose a JPEG or PNG copy.")); image.src = sourceUrl;
      return () => { image.onload = null; image.onerror = null; };
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("The photo has no readable dimensions.");
    canvas = document.createElement("canvas");
    const context = canvas.getContext("2d"); if (!context) throw new Error("Photo preparation is unavailable in this browser.");
    let result: Blob | null = null;
    for (const dimension of [1280, 960, 640]) {
      const scale = Math.min(1, dimension / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.86, 0.72, 0.58]) {
        result = await photoStep<Blob | null>(signal, resolve => { canvas!.toBlob(resolve, "image/jpeg", quality); });
        if (result && result.size > 0 && result.size <= 250000) break;
      }
      if (result && result.size > 0 && result.size <= 250000) break;
    }
    if (!result || result.size <= 0 || result.size > 250000) throw new Error("Crop the photo or choose a smaller JPEG or PNG.");
    const dataUrl = await photoStep<string>(signal, (resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? "")); reader.onerror = () => reject(new Error("The prepared photo could not be read."));
      reader.readAsDataURL(result);
      return () => { reader.onload = null; reader.onerror = null; if (reader.readyState === 1) reader.abort(); };
    });
    if (!dataUrl.startsWith("data:image/jpeg;base64,")) throw new Error("The prepared photo format could not be verified.");
    return { dataUrl, fileName: `${file.name.replace(/\.[^.]+$/, "") || "site-photo"}-quote.jpg`, mimeType: "image/jpeg" };
  } finally {
    image.onload = null; image.onerror = null; image.src = "";
    if (canvas) { canvas.width = 1; canvas.height = 1; }
    URL.revokeObjectURL(sourceUrl);
  }
}
