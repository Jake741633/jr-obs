"use client";

export const JR_OS_STORAGE_PREFIX = "jr-os-";

export interface JrAiProfile {
  ownerName: string;
  businessName: string;
  defaultLabourRate: number;
  preferredSuppliers: string[];
  preferredCertificateInspector: string;
  quoteStyle: "Detailed" | "Balanced" | "Simple";
  riskPreference: "Cautious" | "Balanced";
  notes: string;
  learningEnabled: boolean;
  updatedAt: string;
}

export const defaultAiProfile: JrAiProfile = {
  ownerName: "Jake Rinaldi",
  businessName: "JR Electrical Services",
  defaultLabourRate: 45,
  preferredSuppliers: ["CEF", "Screwfix", "TLC"],
  preferredCertificateInspector: "Jake Rinaldi",
  quoteStyle: "Balanced",
  riskPreference: "Cautious",
  notes: "",
  learningEnabled: true,
  updatedAt: new Date(0).toISOString(),
};

export interface JrOsBackup {
  version: 1;
  exportedAt: string;
  app: "JR OS";
  data: Record<string, unknown>;
}

export function exportJrOsData(): JrOsBackup {
  const data: Record<string, unknown> = {};
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith(JR_OS_STORAGE_PREFIX)) continue;
    const raw = window.localStorage.getItem(key);
    if (raw === null) continue;
    try {
      data[key] = JSON.parse(raw);
    } catch {
      data[key] = raw;
    }
  }
  return { version: 1, exportedAt: new Date().toISOString(), app: "JR OS", data };
}

export function downloadJrOsBackup() {
  const backup = exportJrOsData();
  const date = backup.exportedAt.slice(0, 10);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `jr-os-backup-${date}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importJrOsBackup(file: File) {
  const parsed = JSON.parse(await file.text()) as Partial<JrOsBackup>;
  if (parsed.app !== "JR OS" || parsed.version !== 1 || !parsed.data || typeof parsed.data !== "object") {
    throw new Error("This is not a valid JR OS backup file.");
  }
  Object.entries(parsed.data).forEach(([key, value]) => {
    if (!key.startsWith(JR_OS_STORAGE_PREFIX)) return;
    window.localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  });
  return Object.keys(parsed.data).filter((key) => key.startsWith(JR_OS_STORAGE_PREFIX)).length;
}
