import type { SiteSurvey } from "./models";

export interface SurveyAssistDraft {
  defects: string[];
  risks: string[];
  recommendations: string[];
  consumerUnit: Partial<Pick<SiteSurvey,
    "consumerUnitManufacturer" | "consumerUnitWays" | "spdFitted" | "rcbosFitted" | "rcdType" | "consumerUnitCondition" | "mainBonding"
  >>;
  confidence: "High" | "Medium" | "Low";
  notes: string[];
}

const rules = [
  { phrases: ["no spd", "spd not fitted", "without spd"], defect: "No SPD", recommendation: "Install surge protection", patch: { spdFitted: false } },
  { phrases: ["spd fitted", "has spd"], patch: { spdFitted: true } },
  { phrases: ["no rcd", "no rcd protection"], defect: "No RCD protection", recommendation: "Provide 30 mA RCD protection" },
  { phrases: ["rcbos fitted", "all rcbo", "individual rcbos"], patch: { rcbosFitted: true } },
  { phrases: ["no rcbo", "split load board"], defect: "No RCBOs", recommendation: "Consider RCBO consumer unit upgrade", patch: { rcbosFitted: false } },
  { phrases: ["bonding not visible", "no gas bonding", "no water bonding", "missing bonding"], defect: "Missing main bonding", recommendation: "Confirm and install main protective bonding", patch: { mainBonding: "Not confirmed / not visible" } },
  { phrases: ["overheating", "burning", "scorch", "melted"], defect: "Signs of overheating", recommendation: "Investigate and repair overheated connections" },
  { phrases: ["damaged socket", "damaged accessory", "cracked accessory"], defect: "Damaged accessories", recommendation: "Replace damaged accessories" },
  { phrases: ["vir cable", "rubber cable", "old rubber wiring"], defect: "Rubber or VIR cable", recommendation: "Assess for partial or full rewire" },
  { phrases: ["no labels", "not labelled", "missing labels"], defect: "No labelling", recommendation: "Provide circuit identification and notices" },
  { phrases: ["asbestos", "asbestos suspected"], risk: "Asbestos suspected" },
  { phrases: ["working at height", "high level"], risk: "Working at height" },
  { phrases: ["occupied property", "customer living", "tenant living"], risk: "Occupied property" },
  { phrases: ["loft access", "through loft"], risk: "Loft access" },
] as const;

function findNumberOfWays(text: string): string | undefined {
  const match = text.match(/\b(\d{1,2})\s*(?:way|ways)\b/i);
  return match?.[1];
}

function findManufacturer(text: string): string | undefined {
  const makes = ["Hager", "Schneider", "Square D", "Wylex", "Crabtree", "Contactum", "FuseBox", "BG", "MK", "MEM", "Eaton", "Legrand"];
  return makes.find((make) => text.toLowerCase().includes(make.toLowerCase()));
}

export function interpretSurveyTranscript(transcript: string): SurveyAssistDraft {
  const text = transcript.toLowerCase();
  const defects = new Set<string>();
  const risks = new Set<string>();
  const recommendations = new Set<string>();
  const consumerUnit: SurveyAssistDraft["consumerUnit"] = {};
  let matches = 0;

  for (const rule of rules) {
    if (!rule.phrases.some((phrase) => text.includes(phrase))) continue;
    matches += 1;
    if ("defect" in rule && rule.defect) defects.add(rule.defect);
    if ("risk" in rule && rule.risk) risks.add(rule.risk);
    if ("recommendation" in rule && rule.recommendation) recommendations.add(rule.recommendation);
    if ("patch" in rule && rule.patch) Object.assign(consumerUnit, rule.patch);
  }

  const ways = findNumberOfWays(transcript);
  if (ways) {
    consumerUnit.consumerUnitWays = ways;
    matches += 1;
  }

  const manufacturer = findManufacturer(transcript);
  if (manufacturer) {
    consumerUnit.consumerUnitManufacturer = manufacturer;
    matches += 1;
  }

  if (text.includes("plastic board") || text.includes("plastic consumer unit")) {
    consumerUnit.consumerUnitCondition = "Plastic enclosure — condition and location require inspector review";
    matches += 1;
  }
  if (text.includes("metal board") || text.includes("metal consumer unit")) {
    consumerUnit.consumerUnitCondition = "Metal enclosure — visually identified, condition requires inspector review";
    matches += 1;
  }

  return {
    defects: [...defects],
    risks: [...risks],
    recommendations: [...recommendations],
    consumerUnit,
    confidence: matches >= 5 ? "High" : matches >= 2 ? "Medium" : "Low",
    notes: matches === 0
      ? ["No recognised phrases yet. Keep the wording factual and include the board make, number of ways, protective devices, bonding, visible defects and site risks."]
      : ["All suggestions are drafts. Confirm by inspection and testing before relying on them."],
  };
}
