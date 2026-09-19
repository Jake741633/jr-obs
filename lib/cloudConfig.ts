export type CloudReadiness = {
  configured: boolean;
  projectUrlPresent: boolean;
  anonKeyPresent: boolean;
  mode: "local" | "cloud-ready";
};

export function getCloudReadiness(): CloudReadiness {
  const projectUrlPresent = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKeyPresent = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const configured = projectUrlPresent && anonKeyPresent;

  return {
    configured,
    projectUrlPresent,
    anonKeyPresent,
    mode: configured ? "cloud-ready" : "local",
  };
}

export const cloudCollections = [
  "customers",
  "builders",
  "jobs",
  "pricing_documents",
  "invoices",
  "materials",
  "surveys",
  "certificates",
  "job_packs",
  "ai_profiles",
] as const;

export type CloudCollection = (typeof cloudCollections)[number];
