export const CLOUD_JSON_TIMEOUT_MS = 30_000;
export const PRIVATE_UPLOAD_TIMEOUT_MS = 120_000;
export const PRIVATE_DOWNLOAD_TIMEOUT_MS = 60_000;

/** Keep one deadline alive through headers and complete body consumption. */
export async function withRequestLifecycle<T>(
  url: string,
  init: RequestInit,
  consume: (response: Response) => Promise<T>,
  ownershipIsCurrent: () => boolean,
  timeoutMs = CLOUD_JSON_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const caller = init.signal;
  const abort = () => controller.abort();
  const retire = () => {
    try { if (!ownershipIsCurrent()) abort(); }
    catch { abort(); }
  };
  const storageChanged = (event: StorageEvent) => {
    if (event.key === null || event.key === "jr-os-supabase-session" || event.key === "jr-os-supabase-session-epoch") retire();
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    caller?.addEventListener("abort", abort, { once: true });
    if (typeof window !== "undefined") {
      window.addEventListener("jr-os-cloud-identity-changed", retire);
      window.addEventListener("storage", storageChanged);
    }
    if (caller?.aborted) abort();
    retire();
    if (controller.signal.aborted) throw new Error("Cloud request cancelled.");
    timer = setTimeout(abort, timeoutMs);
    const response = await fetch(url, { ...init, signal: controller.signal });
    const value = await consume(response);
    retire();
    if (controller.signal.aborted) throw new Error("Cloud request cancelled.");
    return value;
  } catch (error) {
    retire();
    // A cancelled error body must not be mistaken for a definitive HTTP/auth
    // failure, even when a response parser deliberately tolerates empty JSON.
    if (controller.signal.aborted) throw new Error("Cloud request cancelled.");
    throw error;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    caller?.removeEventListener("abort", abort);
    if (typeof window !== "undefined") {
      window.removeEventListener("jr-os-cloud-identity-changed", retire);
      window.removeEventListener("storage", storageChanged);
    }
    controller.abort();
  }
}
