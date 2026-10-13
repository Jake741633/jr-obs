import type { CertificateObservation, ObservationCode, SuggestionConfidence } from "./models";
import { makeId } from "./storage";

type Rule = {
  keywords: string[];
  observation: string;
  recommendation: string;
  regulationReference: string;
  code: ObservationCode;
  confidence: SuggestionConfidence;
};

const rules: Rule[] = [
  {
    keywords: ["exposed live", "live parts accessible", "bare live"],
    observation: "Accessible live parts present, creating an immediate risk of electric shock.",
    recommendation: "Isolate the affected equipment or circuit immediately and arrange urgent remedial work.",
    regulationReference: "BS 7671 Chapter 41",
    code: "C1",
    confidence: "High",
  },
  {
    keywords: ["overheating", "burnt", "burning", "scorched", "heat damage"],
    observation: "Evidence of overheating or thermal damage was identified.",
    recommendation: "Investigate the cause, replace damaged components and verify terminations and loading.",
    regulationReference: "BS 7671 Regulation 526.1",
    code: "C2",
    confidence: "High",
  },
  {
    keywords: ["no gas bond", "gas bonding missing", "no bonding to gas", "main bonding gas"],
    observation: "Main protective bonding to the gas installation was not confirmed.",
    recommendation: "Verify and install compliant main protective bonding where required.",
    regulationReference: "BS 7671 Regulation 411.3.1.2",
    code: "C2",
    confidence: "High",
  },
  {
    keywords: ["no water bond", "water bonding missing", "no bonding to water", "main bonding water"],
    observation: "Main protective bonding to the water installation was not confirmed.",
    recommendation: "Verify and install compliant main protective bonding where required.",
    regulationReference: "BS 7671 Regulation 411.3.1.2",
    code: "C2",
    confidence: "High",
  },
  {
    keywords: ["no rcd", "without rcd", "not rcd protected", "lack of rcd"],
    observation: "Required additional protection by a 30 mA RCD was not confirmed for the described circuit or equipment.",
    recommendation: "Confirm the installation conditions and provide suitable RCD protection where required.",
    regulationReference: "BS 7671 Regulation 411.3.3",
    code: "C2",
    confidence: "Medium",
  },
  {
    keywords: ["no spd", "spd not fitted", "without spd", "surge protection missing"],
    observation: "Surge protective devices were not identified at the origin.",
    recommendation: "Assess the need for surge protection and record the design decision with the client.",
    regulationReference: "BS 7671 Section 443",
    code: "C3",
    confidence: "Medium",
  },
  {
    keywords: ["plastic board", "plastic consumer unit", "combustible consumer unit"],
    observation: "A combustible consumer unit enclosure is installed.",
    recommendation: "Assess its location and condition; consider replacement with a suitable non-combustible enclosure where improvement is warranted.",
    regulationReference: "BS 7671 Regulation 421.1.201",
    code: "C3",
    confidence: "Low",
  },
  {
    keywords: ["no label", "labels missing", "circuit chart missing", "not labelled"],
    observation: "Circuit identification or required labelling is incomplete or missing.",
    recommendation: "Provide clear and durable circuit identification and statutory notices.",
    regulationReference: "BS 7671 Section 514",
    code: "C3",
    confidence: "Medium",
  },
  {
    keywords: ["unable to test", "could not test", "further investigation", "inaccessible joint", "unknown fault"],
    observation: "The condition of part of the installation could not be fully determined during this inspection.",
    recommendation: "Carry out further investigation without delay and record the findings.",
    regulationReference: "Further investigation required",
    code: "FI",
    confidence: "High",
  },
];

export function suggestCertificateObservations(input: string): CertificateObservation[] {
  const normalised = input.toLowerCase();
  const matches = rules.filter((rule) => rule.keywords.some((keyword) => normalised.includes(keyword)));

  if (matches.length === 0) {
    return [{
      id: makeId("observation"),
      sourceText: input,
      location: "",
      observation: input.trim(),
      recommendation: "Review the observation, select the appropriate classification and add a regulation reference where applicable.",
      regulationReference: "",
      code: "No code",
      confidence: "Low",
      accepted: false,
    }];
  }

  return matches.map((rule) => ({
    id: makeId("observation"),
    sourceText: input,
    location: "",
    observation: rule.observation,
    recommendation: rule.recommendation,
    regulationReference: rule.regulationReference,
    code: rule.code,
    confidence: rule.confidence,
    accepted: false,
  }));
}
