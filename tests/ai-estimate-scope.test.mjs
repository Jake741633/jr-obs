import assert from "node:assert/strict";
import test from "node:test";
import { loadLocalTs } from "./helpers/load-local-ts.mjs";
import { quoteScopeNotes } from "../lib/connectedQuoteScope.mjs";

const ai = loadLocalTs(new URL("../lib/aiCommandCentre.ts", import.meta.url));
const learning = loadLocalTs(new URL("../lib/aiLearning.ts", import.meta.url));
const starter = loadLocalTs(new URL("../lib/starterData.ts", import.meta.url));
const plain = value => JSON.parse(JSON.stringify(value));
const labourSettings = { workingDaysPerYear: 220, billableHoursPerDay: 7.5, targetNetMargin: 25, contingencyPercent: 0 };
const quoteSettings = { defaultLabourRateId: "", materialMarkupPercent: 20, contingencyPercent: 0, travelCost: 0, travelPrice: 0, parkingCost: 0, parkingPrice: 0 };
const pack = (id, name, hours, description = name) => ({ id, name, description, category: "Domestic", notes: "Making good excluded", internalNotes: "PRIVATE BENCHMARK", labourHours: hours, labourRate: 50, updatedAt: "2026-01-01", materials: [{ id: `${id}-line`, description: `${name} material`, quantity: 1, unitCost: 4.123, unitPrice: 9.875 }] });
const socket = pack("socket", "Replace one double socket", 2);
const fan = pack("fan", "Replace bathroom extractor fan", 8);
const lights = pack("lights", "Install four LED downlights", 12);
const args = (overrides = {}) => ({ notes: "Replace one double socket in the hallway", materials: [], jobPacks: [socket, fan, lights], documents: [], jobs: [], invoices: [], markupPercent: 20, labourRates: [], overheads: [], labourSettings, quoteSettings, createId: prefix => `${prefix}-1`, ...overrides });
const quote = (id, title, hours, materialDescription) => ({ id, type: "Quote", status: "Accepted", number: id, title, notes: title, templateType: "Domestic", createdAt: "2026-01-01", updatedAt: "2026-01-01", items: [{ id: `${id}-labour`, category: "Labour", quantity: hours, unitPrice: 50, unitCost: 20 }, { id: `${id}-material`, category: "Materials", description: materialDescription, quantity: 1, unitCost: 10, unitPrice: 20 }] });

test("a specific socket estimate uses matching saved work rather than unrelated domestic packs", () => {
  const input = args(), before = plain(input);
  const suggestions = ai.suggestMaterials(input);
  assert.deepEqual(plain(suggestions.map(item => item.description)), ["Replace one double socket material"]);
  assert.equal(ai.recommendPricing(input).labourHours, 2);
  assert.equal(suggestions[0].quantity, 1);
  assert.equal(suggestions[0].unitCost, 4.123);
  assert.equal(suggestions[0].unitPrice, 9.875);
  assert.doesNotMatch(JSON.stringify(suggestions), /PRIVATE BENCHMARK/);
  assert.deepEqual(plain(input), before);
});

test("questions and exclusions from a reviewed connected scope cannot become priced work", () => {
  const notes = quoteScopeNotes({ title: "Hall socket", summary: "One replacement faceplate", scope: ["Replace one double socket"], questions: ["Is a consumer unit upgrade required?"], exclusions: ["Full rewire excluded", "Heating-controls wiring excluded"] });
  assert.equal(ai.inferJobType(notes), "Domestic");
  assert.deepEqual(plain(ai.extractScopeItems(notes)), ["Replace one double socket"]);
  const draft = ai.buildAiQuoteDraft(args({ notes }));
  assert.deepEqual(plain(draft.exclusions), ["Full rewire excluded", "Heating-controls wiring excluded"]);
  assert.ok(draft.questionsToConfirm.includes("Is a consumer unit upgrade required?"));
  assert.equal(draft.pricing.labourHours, 2);
  assert.doesNotMatch(JSON.stringify(draft.scopeItems), /required|excluded|Questions|Proposed/);
  assert.match(draft.notes, /Full rewire excluded/);
});

test("explicit negative work clauses do not promote excluded packs", () => {
  for (const notes of ["Replace one double socket. No fan work. Downlights excluded.", "No rewire required, but replace one double socket.", "Replace one double socket; do not include fan work."]) {
    assert.equal(ai.inferJobType(notes), "Domestic");
    assert.deepEqual(plain(ai.suggestMaterials(args({ notes })).map(item => item.description)), ["Replace one double socket material"]);
    assert.deepEqual(plain(ai.extractScopeItems(notes).map(item => item.toLowerCase())), ["replace one double socket"]);
  }
});

test("everyday job language recognises a fusebox while faulty replacements stay installation work", () => {
  for (const notes of ["Replace the fusebox", "Change the fuse box", "Replace the fuseboard"]) assert.equal(ai.inferJobType(notes), "Consumer Unit");
  assert.equal(ai.inferJobType("Replace faulty socket"), "Domestic");
  for (const notes of ["No power to the sockets", "Find why the lights keep tripping", "Fault finding on kitchen circuit"]) assert.equal(ai.inferJobType(notes), "Fault Finding");
  assert.equal(ai.inferJobType("Replace a fusebox", "Commercial"), "Commercial");
});

test("pack identity conflicts cannot influence either materials or labour", () => {
  const jobPacks = [socket, { ...socket, name: "Replace socket duplicate", labourHours: 100 }, { ...socket, id: " " }];
  assert.equal(ai.suggestMaterials(args({ jobPacks })).length, 0);
  assert.equal(ai.recommendPricing(args({ jobPacks })).labourHours, 8);
});

test("alternative packs are selected consistently without merging their separate allowances", () => {
  const alternate = { ...socket, id: "z-alternate", labourHours: 6, materials: [{ ...socket.materials[0], description: "Alternative socket allowance", quantity: 10 }] };
  const forward = args({ jobPacks: [alternate, fan, socket] });
  const reversed = { ...forward, jobPacks: [...forward.jobPacks].reverse() };
  assert.deepEqual(plain(ai.suggestMaterials(forward).map(item => item.description)), ["Replace one double socket material"]);
  assert.deepEqual(plain(ai.suggestMaterials(forward)), plain(ai.suggestMaterials(reversed)));
  assert.equal(ai.recommendPricing(forward).labourHours, 2);
  assert.equal(ai.recommendPricing(reversed).labourHours, 2);
});

test("separate requested tasks use separate pack labour allowances without rescaling their BOM", () => {
  const input = args({ notes: "Replace one double socket and replace the bathroom extractor fan" });
  assert.deepEqual(plain(ai.suggestMaterials(input).map(item => item.description).sort()), ["Replace bathroom extractor fan material", "Replace one double socket material"]);
  assert.equal(ai.recommendPricing(input).labourHours, 10);
});

test("same-type successful history must match the actual requested work before supplying prices or materials", () => {
  const shower = quote("shower", "Replace electric shower", 16, "Electric shower"), oldSocket = quote("old-socket", "Replace double socket", 3, "Socket faceplate");
  const noMatch = args({ jobPacks: [], documents: [shower] });
  assert.equal(learning.buildQuoteLearningSuggestion(noMatch).sampleSize, 0);
  assert.equal(ai.suggestMaterials(noMatch).length, 0);
  const relevant = args({ jobPacks: [], documents: [shower, oldSocket] });
  assert.equal(learning.buildQuoteLearningSuggestion(relevant).averageLabourHours, 3);
  assert.deepEqual(plain(ai.suggestMaterials(relevant).map(item => item.description)), ["Socket faceplate"]);
});

test("generic job-type selection cannot establish a confident pack or history scope match", () => {
  const input = args({ notes: "Domestic electrical works", jobType: "Domestic", documents: [quote("shower", "Replace electric shower", 16, "Electric shower")] });
  assert.equal(ai.suggestMaterials(input).length, 0);
  assert.equal(learning.buildQuoteLearningSuggestion(input).sampleSize, 0);
  assert.equal(ai.recommendPricing(input).labourHours, 8);
});

test("different requested and saved point counts prompt review and preserve the saved quantities and labour", () => {
  const saved = { ...lights, materials: [{ ...lights.materials[0], description: "LED downlight", quantity: 4 }] };
  const draft = ai.buildAiQuoteDraft(args({ notes: "Install six LED downlights", jobPacks: [saved] }));
  assert.equal(draft.materials[0].quantity, 4);
  assert.equal(draft.pricing.labourHours, 12);
  assert.ok(Array.isArray(draft.questionsToConfirm), "draft needs explicit survey questions");
  assert.ok(draft.questionsToConfirm.some(question => /6 downlights/i.test(question) && /4/.test(question) && /review|confirm/i.test(question)));
  assert.equal(draft.packMatches[0].id, "lights");
  assert.match(draft.packMatches[0].reason, /downlight/i);
  assert.doesNotMatch(JSON.stringify(draft.packMatches), /PRIVATE BENCHMARK/);
});

test("an inline without clause cannot turn a fusebox replacement into a rewire", () => {
  const notes = "Replace the fusebox without a rewire";
  assert.equal(ai.inferJobType(notes), "Consumer Unit");
  assert.deepEqual(plain(ai.extractScopeItems(notes)), ["Replace the fusebox"]);
  assert.equal(ai.inferJobType("Board change with SPD"), "Consumer Unit");
});

test("point counts remain in included work and are checked against a uniquely described saved material", () => {
  const saved = { ...lights, name: "Downlight installation", description: "Fit LED downlights", materials: [{ ...lights.materials[0], description: "LED downlight", quantity: 4 }] };
  const draft = ai.buildAiQuoteDraft(args({ notes: "6 LED downlights", jobPacks: [saved] }));
  assert.deepEqual(plain(draft.scopeItems), ["6 LED downlights"]);
  assert.equal(draft.materials[0].quantity, 4);
  assert.ok(draft.questionsToConfirm.some(question => /6 downlights.*allows 4/i.test(question)));
});

test("missing EICR detail produces a survey question about the inspection extent and circuit count", () => {
  const draft = ai.buildAiQuoteDraft(args({ notes: "Landlord report for a flat", jobPacks: [] }));
  assert.equal(draft.jobType, "EICR");
  assert.ok(draft.questionsToConfirm.some(question => /circuit count/i.test(question) && /extent/i.test(question)));
});

test("ambiguous saved history identities cannot supply arbitrary material or labour evidence", () => {
  const saved = quote("history", "Replace double socket", 16, "Socket faceplate");
  for (const duplicate of [{ ...saved, items: [] }, { ...saved, type: "Estimate", status: "Draft" }]) {
    const input = args({ jobPacks: [], documents: [saved, duplicate] });
    assert.equal(learning.buildQuoteLearningSuggestion(input).sampleSize, 0);
    assert.equal(ai.suggestMaterials(input).length, 0);
  }
});

test("a matching saved pack is not padded with alternative library products", () => {
  const material = (id, name) => ({ id, name, category: "Accessories", tradeCost: 5, sellPrice: 10, favourite: false, updatedAt: "2026-01-01", supplier: "CEF", stockCode: id });
  const jobPacks = [{ ...socket, materials: [{ ...socket.materials[0], materialId: "white-socket" }] }];
  const input = args({ jobPacks, materials: [material("white-socket", "White double socket"), material("usb-socket", "USB double socket"), material("metal-socket", "Metal double socket")] });
  assert.deepEqual(plain(ai.suggestMaterials(input).map(item => item.materialId)), ["white-socket"]);
});

test("diagnostic-only symptoms do not add installation packs for the affected accessories", () => {
  const diagnostic = pack("fault", "Fault finding first two hours", 2);
  const input = args({ notes: "No power to the sockets", jobPacks: [socket, fan, diagnostic] });
  assert.equal(ai.recommendPricing(input).labourHours, 2);
  assert.deepEqual(plain(ai.suggestMaterials(input).map(item => item.description)), ["Fault finding first two hours material"]);
});

test("overlapping combined packs cannot count the same requested task twice", () => {
  const combined = pack("combined", "Socket and fan small works", 10, "Replace a double socket and add a fan");
  const input = args({ notes: "Replace one double socket and add a fan", jobPacks: [socket, combined] });
  const draft = ai.buildAiQuoteDraft(input);
  assert.deepEqual(plain(draft.packMatches.map(match => match.id)), ["socket"]);
  assert.equal(draft.pricing.labourHours, 2);
  assert.ok(draft.questionsToConfirm.some(question => /fan/i.test(question) && /allowance/i.test(question) && /review/i.test(question)));
  assert.deepEqual(plain(ai.suggestMaterials(input).map(item => item.description)), ["Replace one double socket material"]);
});

test("a socket request cannot import an out-of-scope full rewire pack or successful rewire history", () => {
  const rewire = pack("rewire", "Full house rewire", 120, "Rewire a house including new double sockets and lighting");
  const historical = { ...quote("old-rewire", "Full house rewire", 120, "Double sockets"), notes: "Full rewire including new double sockets and lighting", templateType: "Rewire" };
  const input = args({ jobPacks: [rewire], documents: [historical] });
  assert.equal(ai.suggestMaterials(input).length, 0);
  assert.equal(learning.buildQuoteLearningSuggestion(input).sampleSize, 0);
  assert.equal(ai.recommendPricing(input).labourHours, 8);
});

test("an existing board mentioned as the supply does not turn a cooker-circuit pack into a board-change task", () => {
  const cooker = pack("cooker", "Install cooker circuit", 8, "Install a new cooker radial circuit from a suitable distribution board");
  const input = args({ notes: "Install a cooker circuit", jobPacks: [cooker] });
  assert.deepEqual(plain(ai.suggestMaterials(input).map(item => item.description)), ["Install cooker circuit material"]);
  assert.equal(ai.recommendPricing(input).labourHours, 8);
});

test("included work survives a separate exclusion in the same sentence", () => {
  for (const notes of ["Replace one double socket, fan work excluded", "No fan work and replace one double socket", "Replace one double socket and fan work is not required"]) {
    assert.deepEqual(plain(ai.extractScopeItems(notes).map(item => item.toLowerCase())), ["replace one double socket"]);
    assert.deepEqual(plain(ai.suggestMaterials(args({ notes })).map(item => item.description)), ["Replace one double socket material"]);
  }
});

test("an empty proposed scope cannot become priced labour from questions or exclusions", () => {
  const notes = quoteScopeNotes({ title: "More information needed", summary: "The work is not defined", scope: [], questions: ["What work is required?"], exclusions: ["Full rewire excluded"] });
  const labourRates = [{ id: "electrician", name: "Electrician hourly", unit: "Hour", costRate: 20, chargeRate: 50, active: true }];
  const draft = ai.buildAiQuoteDraft(args({ notes, labourRates }));
  assert.deepEqual(plain(draft.scopeItems), []);
  assert.equal(draft.items.length, 0);
  assert.equal(draft.profitability, null);
  assert.ok(draft.questionsToConfirm.includes("What work is required?"));
});

test("negative conjunctions exclude fans when estimating against the actual starter catalogue", () => {
  for (const notes of ["Replace one socket and do not include a fan", "Replace the socket, not the fan"]) {
    const draft = ai.buildAiQuoteDraft(args({ notes, jobPacks: starter.starterJobPacks, materials: starter.starterMaterials }));
    assert.doesNotMatch(draft.scopeItems.join(" "), /fan/i);
    assert.ok(draft.exclusions.some(item => /fan/i.test(item)));
    assert.ok(!draft.packMatches.some(item => /fan/i.test(item.name)));
    assert.ok(!draft.materials.some(item => /fan/i.test(item.description)));
  }
});

test("a single garden-office socket cannot import the complete garden-office fit-out", () => {
  const draft = ai.buildAiQuoteDraft(args({ notes: "Add one socket to the garden office", jobPacks: starter.starterJobPacks, materials: starter.starterMaterials }));
  assert.deepEqual(plain(draft.packMatches.map(item => item.id)), ["starter-pack-001"]);
  assert.equal(draft.pricing.labourHours, 3);
  assert.ok(!draft.materials.some(item => /batten|bulkhead|switch(?:es)?$/i.test(item.description)));
});

test("a neutral pack name still exposes a mismatch with the actual saved socket count", () => {
  const garden = starter.starterJobPacks.find(item => item.id === "starter-pack-051");
  const notes = "Fit out the garden office with one double socket, one batten, one bulkhead and two switches on existing circuits";
  const draft = ai.buildAiQuoteDraft(args({ notes, jobPacks: [garden], materials: starter.starterMaterials }));
  assert.equal(draft.packMatches[0]?.id, "starter-pack-051");
  assert.equal(draft.materials.find(item => item.materialId === "starter-mat-029").quantity, 4);
  assert.ok(draft.questionsToConfirm.some(question => /1 sockets.*allows 4/i.test(question)));
});

test("actual Cat6 and doorbell packs contribute separate requested task allowances", () => {
  const notes = "Install two Cat6 outlets and renew a doorbell chime";
  const draft = ai.buildAiQuoteDraft(args({ notes, jobPacks: starter.starterJobPacks, materials: starter.starterMaterials }));
  assert.deepEqual(plain(draft.packMatches.map(item => item.id).sort()), ["starter-pack-062", "starter-pack-063"]);
  assert.equal(draft.pricing.labourHours, 10.5);
  const missing = ai.buildAiQuoteDraft(args({ notes, jobPacks: starter.starterJobPacks.filter(item => item.id === "starter-pack-062"), materials: starter.starterMaterials }));
  assert.ok(missing.questionsToConfirm.some(question => /doorbell/i.test(question) && /allowance/i.test(question)));
});

test("preferred saved hourly and day units control new-draft buying and selling calculations", () => {
  for (const { unit, name, hours, costRate, chargeRate, mode, quantity, cost, price } of [
    { unit: "Hour", name: "Day rate label", hours: 12, costRate: 20, chargeRate: 50, mode: "Hours", quantity: 12, cost: 240, price: 600 },
    { unit: "Hour", name: "Day rate label", hours: 2, costRate: 20, chargeRate: 50, mode: "Hours", quantity: 2, cost: 40, price: 100 },
    { unit: "Day", name: "Hourly rate label", hours: 12, costRate: 150, chargeRate: 300, mode: "Days", quantity: 2, cost: 300, price: 600 },
    { unit: "Day", name: "Hourly rate label", hours: 2, costRate: 150, chargeRate: 300, mode: "Days", quantity: 0.5, cost: 75, price: 150 },
  ]) {
    const rate = { id: "preferred", name, unit, costRate, chargeRate, active: true };
    const input = args({ notes: "Replace one double socket", jobPacks: [{ ...socket, labourHours: hours }], labourRates: [rate], quoteSettings: { ...quoteSettings, defaultLabourRateId: rate.id } });
    const before = plain(input), draft = ai.buildAiQuoteDraft(input), line = draft.items.find(item => item.category === "Labour");
    assert.equal(draft.pricing.labourMode, mode, `${unit} at ${hours} hours`);
    assert.equal(draft.pricing.labourQuantity, quantity);
    assert.equal(draft.pricing.labourCost, cost);
    assert.equal(draft.pricing.labourPrice, price);
    assert.equal(line.quantity * line.unitCost, cost);
    assert.equal(line.quantity * line.unitPrice, price);
    assert.equal(line.unitCost, costRate);
    assert.deepEqual(plain(input), before);
  }
});

test("half-day and attendance rate units remain whole saved charges rather than hourly amounts", () => {
  for (const { unit, hours, costRate, chargeRate, quantity, cost, price } of [
    { unit: "Half day", hours: 6, costRate: 80, chargeRate: 150, quantity: 2, cost: 160, price: 300 },
    { unit: "Call-out", hours: 2, costRate: 45, chargeRate: 95, quantity: 1, cost: 45, price: 95 },
    { unit: "Minimum charge", hours: 2, costRate: 45, chargeRate: 95, quantity: 1, cost: 45, price: 95 },
  ]) {
    const rate = { id: "preferred", name: "Hourly electrician label", unit, costRate, chargeRate, active: true };
    const draft = ai.buildAiQuoteDraft(args({ jobPacks: [{ ...socket, labourHours: hours }], labourRates: [rate], quoteSettings: { ...quoteSettings, defaultLabourRateId: rate.id } }));
    const line = draft.items.find(item => item.category === "Labour");
    assert.equal(line.labourMode, "Fixed");
    assert.equal(line.quantity, quantity);
    assert.equal(line.unitCost, costRate);
    assert.equal(draft.pricing.labourCost, cost);
    assert.equal(draft.pricing.labourPrice, price);
    assert.equal(line.quantity * line.unitPrice, price);
  }
});
