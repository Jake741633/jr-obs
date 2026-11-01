import { savedIdentityIndex } from "./assistantIdentity";
import type { JobPack, QuoteTemplateType } from "./models";

export interface EstimateScope {
  jobType: QuoteTemplateType;
  workText: string;
  scopeItems: string[];
  questions: string[];
  exclusions: string[];
  terms: string[];
  tasks: string[];
}

export interface EstimatePackMatch {
  pack: JobPack;
  score: number;
  matchedTerms: string[];
  reason: string;
}

const ignoredTerms = new Set(("and the for with from this that then into onto will need needs quote price estimate customer builder job work works supply install installation replace replacement move add new electrical domestic commercial house flat suitable existing circuit circuits subject survey confirm required requirements allowance material materials one two three four five six seven eight nine ten up to please can you a an is are in on of at as be it its per using include included exclusion excluded testing test checks certification record recorded scope final design compatibility" ).split(" "));
const taskTerms = new Set(["socket", "downlight", "light", "batten", "bulkhead", "switch", "pendant", "fan", "consumerunit", "rewire", "eicr", "fault", "shower", "cooker", "oven", "bonding", "earthing", "alarm", "evcharger", "swa", "containment", "conduit", "trunking", "tray", "boiler", "immersion", "pump", "heatingcontrol", "datapoint", "doorbell"]);
const supportingTasks = new Set(["bonding", "earthing", "swa", "containment", "conduit", "trunking", "tray"]);
const pointNames: Record<string, string> = { socket: "sockets", downlight: "downlights", light: "lights", batten: "battens", bulkhead: "bulkheads", switch: "switches", pendant: "pendants", fan: "fans", alarm: "alarms", datapoint: "data outlets", doorbell: "doorbells" };
const numbers: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 };

function canonical(value: string) {
  return value.toLowerCase()
    .replace(/\b(?:consumer\s+units?|fuse\s*(?:box(?:es)?|boards?)|rcbo\s+boards?|distribution\s+boards?|board\s+change)\b/g, "consumerunit")
    .replace(/\b(?:fault[ -]+finding|diagnostics?|tripping|no\s+power|loss\s+of\s+power|not\s+working)\b/g, "fault")
    .replace(/\b(?:re[ -]?wir(?:e|es|ing)|full\s+house\s+wiring)\b/g, "rewire")
    .replace(/\b(?:condition\s+report|landlord\s+report|periodic\s+inspection)\b/g, "eicr")
    .replace(/\b(?:ev\s+chargers?|electric\s+vehicle\s+chargers?)\b/g, "evcharger")
    .replace(/\bheating[ -]+controls?\b/g, "heatingcontrol")
    .replace(/\b(?:cat[ -]?6a?(?:\s+(?:data|network))?(?:\s+(?:outlets?|points?|runs?|cables?))?|(?:data|network)\s+(?:outlets?|points?))\b/g, "datapoint")
    .replace(/\b(?:doorbells?|chimes?)\b/g, "doorbell")
    .replace(/\b(?:socket\s+outlets?|power\s+points?|sockets?)\b/g, "socket")
    .replace(/\b(?:downlights?|spotlights?)\b/g, "downlight")
    .replace(/\b(?:extractor\s+fans?|fans?)\b/g, "fan")
    .replace(/\blight\s+switch(?:es)?\b/g, "switch")
    .replace(/\b(?:lights|lighting)\b/g, "light")
    .replace(/\b(?:smoke|heat)\s+alarms?\b/g, "alarm")
    .replace(/\bswitches\b/g, "switch")
    .replace(/\b(batten|bulkhead|pendant|shower|cooker|oven|alarm|pump)s\b/g, "$1")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

function terms(value: string) {
  return [...new Set(canonical(value).split(/\s+/).filter(term => term.length > 2 && !/^\d+$/.test(term) && !ignoredTerms.has(term)))];
}

function cleanLine(value: string) {
  // A point count such as "6 downlights" is evidence, not a list marker.
  return value.replace(/^\s*[-*•]+\s*/, "").replace(/^\s*\d+[.)]\s+/, "").replace(/\s+/g, " ").trim().replace(/^(?:but|and)\s+/i, "").replace(/[.;]$/, "");
}

function excludedClause(value: string) {
  if (/\b(?:no\s+power|not\s+working)\b/i.test(value)) return false;
  return /^(?:no\b|not\b|without\b|exclud(?:e|ing)\b|do\s+not\s+include\b|don['’]t\s+include\b)/i.test(value)
    || /\b(?:excluded|not\s+required|not\s+included|by\s+others)\b/i.test(value);
}

/** The connected review already has these headings; only its proposed work is priced. */
export function analyseEstimateScope(notes: string, selectedJobType?: QuoteTemplateType | ""): EstimateScope {
  const scopeItems: string[] = [], questions: string[] = [], exclusions: string[] = [];
  const structuredScope = /^\s*(?:[-*•]\s*)?Proposed scope\s*:?(?:\s|$)/im.test(notes);
  let section: "work" | "questions" | "exclusions" | "summary" = structuredScope ? "summary" : "work";
  for (const rawLine of notes.split(/\r?\n/)) {
    let line = cleanLine(rawLine);
    const heading = line.match(/^(Proposed scope|Questions to confirm|Exclusions)\s*:?(.*)$/i);
    if (heading) {
      section = /^proposed/i.test(heading[1]) ? "work" : /^questions/i.test(heading[1]) ? "questions" : "exclusions";
      line = cleanLine(heading[2]);
    }
    if (!line || section === "summary") continue;
    if (section !== "work") { (section === "questions" ? questions : exclusions).push(line); continue; }
    const clauses = line.split(/[.;](?=\s|$)|,\s+(?=\S)|\s+but\s+|\s+(?=without\b)|\s+and\s+(?=(?:replace|add|install|fit|move|change|no|not|without|exclude|excluding|do\s+not\s+include|don['’]t\s+include)\b|[^.;,]*\b(?:excluded|not\s+(?:required|included)|by\s+others)\b)/i);
    for (const clause of clauses.map(cleanLine).filter(Boolean)) {
      if (excludedClause(clause)) exclusions.push(clause);
      else if (/^(?:is|are|does|do|what|which|whether)\b.*\?$/i.test(clause)) questions.push(clause);
      else scopeItems.push(clause);
    }
  }
  const uniqueScope = [...new Set(scopeItems)].slice(0, 12);
  const workText = uniqueScope.join("\n"), workTerms = terms(workText), source = canonical(workText);
  let jobType: QuoteTemplateType = "Domestic";
  if (/\brewire\b|\bfirst fix\b|\bsecond fix\b/.test(source)) jobType = "Rewire";
  else if (/\beicr\b/.test(source)) jobType = "EICR";
  else if (/\bconsumerunit\b/.test(source)) jobType = "Consumer Unit";
  else if (/\bfault\b/.test(source)) jobType = "Fault Finding";
  else if (/\b(?:commercial|office|shop|warehouse|church|pub|containment|three phase)\b/.test(source)) jobType = "Commercial";
  return { jobType: selectedJobType || jobType, workText, scopeItems: uniqueScope, questions: [...new Set(questions)].slice(0, 12), exclusions: [...new Set(exclusions)].slice(0, 12), terms: workTerms, tasks: workTerms.filter(term => taskTerms.has(term)) };
}

/** Job type and successful outcomes may strengthen a task match, never establish one. */
export function matchEstimateScope(scope: EstimateScope, candidateText: string, primaryText = candidateText) {
  const candidate = analyseEstimateScope(candidateText);
  const primary = primaryText === candidateText ? candidate : analyseEstimateScope(primaryText);
  const matchedTerms = scope.terms.filter(term => candidate.terms.includes(term));
  const matchedTasks = scope.tasks.filter(term => candidate.tasks.includes(term));
  if (!matchedTerms.length || (scope.tasks.length && !matchedTasks.length)) return { score: 0, matchedTerms: [], matchedTasks: [] };
  if (scope.tasks.length && primary.tasks.some(term => !scope.tasks.includes(term) && !supportingTasks.has(term))) return { score: 0, matchedTerms: [], matchedTasks: [] };
  const diagnosticOnly = scope.tasks.includes("fault") && !/\b(?:replace|replacement|fit|install|add|move|change)\b/i.test(scope.workText);
  if (diagnosticOnly && !candidate.tasks.includes("fault")) return { score: 0, matchedTerms: [], matchedTasks: [] };
  const excludedTasks = terms(scope.exclusions.join(" ")).filter(term => taskTerms.has(term) && !scope.tasks.includes(term));
  if (candidate.tasks.some(term => excludedTasks.includes(term))) return { score: 0, matchedTerms: [], matchedTasks: [] };
  return { score: matchedTerms.length / Math.max(1, Math.min(scope.terms.length, candidate.terms.length)), matchedTerms, matchedTasks };
}

function packScopeText(pack: JobPack) {
  const namedTasks = analyseEstimateScope(pack.name).tasks.filter(task => !supportingTasks.has(task));
  if (namedTasks.length) return { text: `${pack.name}\n${pack.description}`, primaryText: pack.name };
  // A neutral fit-out title does not describe its offered work. Use its actual
  // schedule, while an existing board feeding the work remains a supply reference.
  const description = pack.description.replace(/\b(?:from|using|fed\s+(?:from|by)|at)\s+(?:(?:a|an|the|suitable|existing|serviceable)\s+)*(?:consumer\s+unit|distribution\s+board|fuse\s*(?:box|board)|rcbo\s+board)\b/gi, "");
  const text = [pack.name, description, ...pack.materials.map(line => line.description)].join("\n");
  return { text, primaryText: text };
}

/** Pick one saved allowance per requested task instead of blending alternative packs. */
export function rankEstimatePacks({ scope, jobPacks, limit = 5 }: { scope: EstimateScope; jobPacks: JobPack[]; limit?: number }): EstimatePackMatch[] {
  const matches = savedIdentityIndex(jobPacks).selectable.map(pack => {
    const offered = packScopeText(pack);
    const match = matchEstimateScope(scope, offered.text, offered.primaryText);
    const nameMatch = matchEstimateScope(scope, pack.name);
    const action = /\b(?:replace|replacement|change)\b/i.test(scope.workText) && /\b(?:replace|replacement|change)\b/i.test(pack.name) ? 0.25 : 0;
    const quantityMatch = scope.tasks.filter(task => pointNames[task]).reduce((sum, task) => {
      const requested = pointCount(scope.workText, task);
      return sum + (requested !== undefined && requested === savedPointCount(pack, task) ? 0.3 : 0);
    }, 0);
    const score = match.score ? match.score + nameMatch.score * 0.5 + action + quantityMatch + (analyseEstimateScope(`${pack.name} ${pack.category}`).jobType === scope.jobType ? 0.1 : 0) : 0;
    return { pack, ...match, score };
  }).filter(match => match.score > 0).toSorted((left, right) => right.score - left.score || left.pack.id.localeCompare(right.pack.id));
  const covered = new Set<string>(), selected: EstimatePackMatch[] = [];
  for (const match of matches) {
    const coverage = match.matchedTasks.length ? match.matchedTasks : ["custom-scope"];
    if (coverage.some(term => covered.has(term))) continue;
    selected.push({ pack: match.pack, score: match.score, matchedTerms: match.matchedTerms, reason: `Matches ${match.matchedTerms.join(", ")} in the supplied work. Saved pack quantities, buying costs and selling allowances are retained for review.` });
    coverage.forEach(term => covered.add(term));
    if (selected.length >= limit) break;
  }
  return selected;
}

function pointCount(value: string, term: string) {
  const source = canonical(value), countWords = Object.keys(numbers).join("|");
  const pattern = new RegExp(`\\b(\\d+|${countWords})\\s+(?:(?:new|double|single|led|fire|rated|standard|white|mains|interlinked|existing|additional|basic|ip|outdoor)\\s+){0,4}${term}\\b`, "i");
  const count = source.match(pattern)?.[1];
  return count ? numbers[count] ?? Number(count) : undefined;
}

function savedPointCount(pack: JobPack, term: string) {
  const pointLines = pack.materials.filter(line => terms(line.description).includes(term));
  const lineCount = pointLines.length === 1 && Number.isFinite(pointLines[0].quantity) && pointLines[0].quantity > 0 ? pointLines[0].quantity : undefined;
  return pointCount(`${pack.name} ${pack.description}`, term) ?? lineCount;
}

/** These are local prompts for survey review, not findings about the installation. */
export function estimateReviewQuestions(scope: EstimateScope, matches: EstimatePackMatch[]) {
  const questions = [...scope.questions];
  const coveredTasks = new Set(matches.flatMap(match => match.matchedTerms.filter(term => taskTerms.has(term))));
  for (const task of scope.tasks.filter(task => !supportingTasks.has(task) && !coveredTasks.has(task))) {
    questions.push(`No separate job pack allowance matched for ${pointNames[task] || task}; review the scope, materials and labour for that work.`);
  }
  for (const term of scope.tasks.filter(term => pointNames[term])) {
    const requested = pointCount(scope.workText, term);
    if (requested === undefined) questions.push(`Confirm the number and positions of ${pointNames[term]}.`);
    for (const { pack } of matches.filter(match => match.matchedTerms.includes(term))) {
      const saved = savedPointCount(pack, term);
      if (requested !== undefined && saved !== undefined && requested !== saved) questions.push(`You requested ${requested} ${pointNames[term]}; ${pack.name} allows ${saved}. Review the quantities and labour for this job before saving.`);
    }
  }
  if (scope.workText && !/\b(?:access|route|loft|void|surface|making good)\b/i.test(scope.workText)) questions.push("Confirm cable routes, access and making good included in this job.");
  if (scope.tasks.includes("consumerunit")) questions.push("Confirm the circuit count, board specification, supply and bonding checks, testing and certification needed after survey.");
  if (scope.tasks.includes("eicr")) questions.push("Confirm the circuit count, inspection extent, agreed limitations and access for the EICR.");
  if (scope.tasks.includes("fault")) questions.push("Confirm the symptoms, affected circuits and initial diagnostic allowance; agree any repairs separately.");
  return [...new Set(questions)].slice(0, 12);
}
