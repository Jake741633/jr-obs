export type CloudMode = "local" | "cloud" | "migration";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";
const requestedMode = (process.env.NEXT_PUBLIC_JR_OS_CLOUD_MODE?.trim().toLowerCase() || "local") as CloudMode;

export const cloudConfig = {
  url,
  anonKey,
  isConfigured: Boolean(url && anonKey),
  mode: (["local", "cloud", "migration"] as const).includes(requestedMode) ? requestedMode : "local",
};

export function effectiveCloudMode(): CloudMode {
  if (!cloudConfig.isConfigured) return "local";
  return cloudConfig.mode;
}

export const cloudStorageBucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET?.trim() || "jr-os-private";
