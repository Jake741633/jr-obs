export type ClipFrame = { dataUrl: string; seconds: number };
export type PreparedClip = { audio: string | null; frames: ClipFrame[]; duration: number };
export type ReviewedClip = { transcript: string; frames: ClipFrame[]; duration: number };
export const MAX_CLIP_SOURCE_BYTES = 100 * 1024 * 1024;
const MAX_AUDIO_BYTES = 1_500_000;
const acceptedTypes = new Set(["video/mp4", "video/quicktime", "video/webm", "audio/mp4", "audio/x-m4a", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/webm"]);

export function clipFileError(file: Pick<File, "name" | "size" | "type">) {
  if (!file.name.trim() || !Number.isFinite(file.size) || file.size <= 0) return "Choose a recording that is not empty.";
  if (file.size > MAX_CLIP_SOURCE_BYTES) return "Choose a recording under 100 MB and trim it to 60 seconds or less.";
  if (file.type ? !acceptedTypes.has(file.type) : !/\.(mp4|mov|webm|mp3|m4a|wav)$/i.test(file.name)) return "Choose an MP4, MOV, WebM, MP3, M4A or WAV recording.";
  return null;
}
export function clipNotes(notes: string, transcript: string) {
  const speech = transcript.trim();
  const combined = [notes.trim(), speech ? "Reviewed speech from site recording:\n" + speech : ""].filter(Boolean).join("\n\n");
  if (combined.length > 12000) throw new Error("Shorten the job notes or transcript so the combined text is under 12,000 characters.");
  return combined;
}
function cancelled() { return new DOMException("Clip preparation cancelled.", "AbortError"); }
function check(signal: AbortSignal) { if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : cancelled(); }

function mediaStartup(pending: Promise<unknown>, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return; settled = true;
      clearTimeout(timer); signal.removeEventListener("abort", abort);
      if (error) reject(error); else resolve();
    };
    const abort = () => finish(signal.reason || cancelled());
    const timer = setTimeout(() => finish(new Error("The recording took too long to open. Try a shorter clip or another browser.")), 12000);
    signal.addEventListener("abort", abort, { once: true });
    pending.then(() => finish(), error => finish(error || new Error("The recording could not start.")));
    if (signal.aborted) abort();
  });
}

function mediaEvent(media: HTMLMediaElement, name: string, signal: AbortSignal, ms: number) {
  return new Promise<void>((resolve, reject) => {
    const finish = (error?: unknown) => { clearTimeout(timer); media.removeEventListener(name, done); media.removeEventListener("error", failed); signal.removeEventListener("abort", abort); if (error) reject(error); else resolve(); };
    const done = () => finish();
    const failed = () => finish(new Error("This phone could not read the recording. Choose a compatible copy or enter the spoken notes yourself."));
    const abort = () => finish(signal.reason || cancelled());
    const timer = setTimeout(() => finish(new Error("The recording took too long to prepare. Try a shorter clip.")), ms);
    media.addEventListener(name, done, { once: true }); media.addEventListener("error", failed, { once: true }); signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}
function dataUrl(blob: Blob, signal: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    const finish = (error?: unknown) => {
      clearTimeout(timer); signal.removeEventListener("abort", abort); reader.removeEventListener("load", loaded); reader.removeEventListener("error", failed);
      if (error) reject(error); else if (typeof reader.result === "string") resolve(reader.result); else reject(new Error("Prepared media could not be read."));
    };
    const loaded = () => finish(); const failed = () => finish(new Error("Prepared media could not be read."));
    const abort = () => { finish(signal.reason || cancelled()); reader.abort(); };
    const timer = setTimeout(() => { finish(new Error("Prepared media took too long to read.")); reader.abort(); }, 7000);
    reader.addEventListener("load", loaded, { once: true }); reader.addEventListener("error", failed, { once: true }); signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort(); else reader.readAsDataURL(blob);
  });
}
async function captureFrame(media: HTMLVideoElement, seconds: number, signal: AbortSignal): Promise<ClipFrame> {
  check(signal);
  if (Math.abs(media.currentTime - seconds) > 0.0001) { const seeking = mediaEvent(media, "seeked", signal, 5000); media.currentTime = seconds; await seeking; }
  check(signal);
  if (!media.videoWidth || !media.videoHeight) throw new Error("The recording has no readable video image. Choose an audio file or another video.");
  const canvas = document.createElement("canvas"), scale = Math.min(1, 960 / Math.max(media.videoWidth, media.videoHeight));
  canvas.width = Math.max(1, Math.round(media.videoWidth * scale)); canvas.height = Math.max(1, Math.round(media.videoHeight * scale));
  const context = canvas.getContext("2d"); if (!context) throw new Error("Video frames cannot be prepared on this phone.");
  context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(media, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.78, 0.62, 0.45]) {
    const blob = await new Promise<Blob | null>((resolve, reject) => {
      const abort = () => finish(null, signal.reason || cancelled());
      const finish = (value: Blob | null, error?: unknown) => { clearTimeout(timer); signal.removeEventListener("abort", abort); if (error) reject(error); else resolve(value); };
      const timer = setTimeout(() => finish(null, new Error("A video frame took too long to prepare.")), 4000);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort(); else canvas.toBlob(value => finish(value), "image/jpeg", quality);
    });
    check(signal);
    if (blob && blob.size > 0 && blob.size <= 250_000) return { dataUrl: await dataUrl(blob, signal), seconds };
  }
  throw new Error("The video frame could not be made small enough. Choose a different recording.");
}

async function recordSound(media: HTMLMediaElement, stream: MediaStream, mimeType: string, duration: number, signal: AbortSignal, progress: (text: string) => void) {
  check(signal);
  const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 });
  const chunks: Blob[] = []; let bytes = 0, completed = false;
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return; settled = true; clearTimeout(timer);
      signal.removeEventListener("abort", abort); media.removeEventListener("ended", ended); media.removeEventListener("error", failed); media.removeEventListener("timeupdate", update);
      recorder.removeEventListener("dataavailable", data); recorder.removeEventListener("stop", stopped); recorder.removeEventListener("error", failed);
      if (recorder.state !== "inactive") { try { recorder.stop(); } catch { /* already stopped */ } }
      if (error) reject(error); else resolve();
    };
    const abort = () => finish(signal.reason || cancelled());
    const failed = () => finish(new Error("The sound could not be prepared. Choose another recording or use frames with typed notes."));
    const update = () => progress("Preparing sound: " + Math.min(100, Math.round(media.currentTime / duration * 100)) + "%");
    const data = (event: BlobEvent) => { bytes += event.data.size; if (bytes > MAX_AUDIO_BYTES) finish(new Error("Prepared sound is too large. Choose a shorter recording.")); else chunks.push(event.data); };
    const ended = () => { completed = true; try { recorder.stop(); } catch { failed(); } };
    const stopped = () => completed && bytes > 0 ? finish() : finish(new Error("Sound preparation stopped before the full clip was ready."));
    const timer = setTimeout(() => finish(new Error("Sound preparation took too long. Keep JR OS open and try a shorter recording.")), Math.ceil(duration * 1000) + 15000);
    signal.addEventListener("abort", abort, { once: true }); media.addEventListener("ended", ended, { once: true }); media.addEventListener("error", failed, { once: true }); media.addEventListener("timeupdate", update);
    recorder.addEventListener("dataavailable", data); recorder.addEventListener("stop", stopped); recorder.addEventListener("error", failed, { once: true });
    if (signal.aborted) { abort(); return; }
    try { recorder.start(1000); progress("Preparing sound: 0%"); void media.play().catch(failed); } catch { failed(); }
  });
  check(signal);
  const type = recorder.mimeType.split(";")[0].toLowerCase();
  if (!["audio/mp4", "audio/webm"].includes(type)) throw new Error("This phone produced an unsupported sound format.");
  return dataUrl(new Blob(chunks, { type }), signal);
}

/** Local-only preparation. Sending the prepared sound or stills requires a separate user action. */
export async function prepareQuoteClip(file: File, options: { signal?: AbortSignal; speech: boolean; onProgress?: (text: string) => void }): Promise<PreparedClip> {
  const error = clipFileError(file); if (error) throw new Error(error);
  if (options.signal?.aborted) throw cancelled();
  const video = file.type.startsWith("video/") || (!file.type && /\.(mp4|mov|webm)$/i.test(file.name));
  if (!video && !options.speech) throw new Error("Choose a video to prepare frames without speech.");
  const controller = new AbortController(), signal = controller.signal;
  const cancel = () => controller.abort(cancelled());
  const hidden = () => { if (document.visibilityState === "hidden") controller.abort(new Error("Preparation stopped when JR OS was hidden. Keep it open and prepare the clip again.")); };
  options.signal?.addEventListener("abort", cancel, { once: true }); document.addEventListener("visibilitychange", hidden);
  let media: HTMLVideoElement | null = null, context: AudioContext | null = null, source: MediaElementAudioSourceNode | null = null, destination: MediaStreamAudioDestinationNode | null = null, url: string | null = null;
  const progress = options.onProgress || (() => {});
  try {
    hidden(); check(signal);
    let mime = "";
    if (options.speech) {
      const Audio = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Audio || typeof MediaRecorder === "undefined") throw new Error("This phone cannot prepare sound. Use video frames with typed notes or try another browser.");
      mime = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find(type => MediaRecorder.isTypeSupported(type)) || "";
      if (!mime) throw new Error("This phone cannot prepare a supported sound format. Use frames with typed notes.");
      context = new Audio();
    }
    media = document.createElement(video ? "video" : "audio") as HTMLVideoElement;
    media.preload = "auto"; media.playsInline = true; media.muted = !options.speech; media.loop = false; media.playbackRate = 1;
    if (context) { source = context.createMediaElementSource(media); destination = context.createMediaStreamDestination(); source.connect(destination); }
    progress("Opening recording…");
    const loading = mediaEvent(media, "loadeddata", signal, 12000);
    url = URL.createObjectURL(file); media.src = url;
    // Both calls begin in the user's click handler before the first asynchronous wait.
    await mediaStartup(Promise.all([loading, context?.resume(), media.play()]), signal);
    media.pause(); check(signal);
    const duration = media.duration;
    if (!Number.isFinite(duration) || duration <= 0 || duration > 60) throw new Error("Trim the recording to 60 seconds or less, then choose it again.");
    const frames: ClipFrame[] = [];
    if (video) {
      progress("Preparing sampled video frames…");
      for (const seconds of duration < 1 ? [0] : [duration * 0.1, duration * 0.5, duration * 0.9]) frames.push(await captureFrame(media, seconds, signal));
    }
    let audio: string | null = null;
    if (options.speech && destination) {
      if (media.currentTime !== 0) { const seeking = mediaEvent(media, "seeked", signal, 5000); media.currentTime = 0; await seeking; }
      audio = await recordSound(media, destination.stream, mime, duration, signal, progress);
    }
    check(signal); return { audio, frames, duration };
  } finally {
    controller.abort(cancelled()); options.signal?.removeEventListener("abort", cancel); document.removeEventListener("visibilitychange", hidden);
    const releases = [() => media?.pause(), () => media?.removeAttribute("src"), () => media?.load(), () => source?.disconnect(), () => destination?.disconnect(), () => { if (url) URL.revokeObjectURL(url); }];
    for (const release of releases) { try { release(); } catch { /* release the remaining resources */ } }
    for (const track of destination?.stream.getTracks() || []) { try { track.stop(); } catch { /* continue closing */ } }
    if (context) await context.close().catch(() => {});
  }
}
