import assert from "node:assert/strict";
import test from "node:test";
import { crm, contacts, identities, load, hookRuntime, jsx, nodes, text } from "./helpers/follow-up-harness.mjs";
const scheduling = load("lib/scheduling.ts", {});

const lead = (patch = {}) => ({ id: "lead-1", name: "Workshop", company: "Contractor", phone: "07700 900123", email: "work@example.test", stage: "New Lead", source: "Referral", priority: "Normal", estimatedValue: 100, siteAddress: "Epsom High Street", workRequired: "Entrance lighting", nextAction: "Book a visit", followUpDate: "2026-10-10", createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-01T12:00:00Z", ...patch });
function harness(query = "") {
  const runtime = hookRuntime(), frames = new Map(); let frameId = 0, blurred = 0, identity = { organisationId: "org-1", userId: "user-1", role: "owner" };
  const data = { leads: [], activities: [], customers: [], builders: [], documents: [] }, ready = Object.fromEntries(Object.keys(data).map(key => [key, true]));
  const failWrite = () => assert.fail("Browsing, filters, disclosures and deep links must not write records");
  const hooks = { leads: "useSalesLeadsCollection", activities: "useLeadActivitiesCollection", customers: "useCustomersCollection", builders: "useBuildersCollection", documents: "usePricingDocumentsCollection" };
  const page = load("app/leads/page.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx }, react: runtime.hooks, "next/link": { default: "Link" }, "lucide-react": {},
    "../../components/ui/Button": { Button: "Button" }, "../../components/ui/Card": { Card: "Card" }, "../../components/ui/PageHeader": { PageHeader: "PageHeader" }, "../../components/ui/FormField": { InputField: "InputField", TextareaField: "TextareaField" },
    "../../components/crm/LeadPipelineActions": { leadSources: ["Website", "Google", "Referral", "Builder", "Repeat customer", "Social media", "MyJobsQuote", "MyBuilder", "Checkatrade", "Other"], useLeadPipelineActions: () => ({ openCapture: failWrite, reviewStage: failWrite, openRecordAction: failWrite, panel: null, canStart: true, canDelete: true, ready: true }) },
    "../../lib/cloud/coreBusinessCollections": Object.fromEntries(Object.entries(hooks).map(([key, hook]) => [hook, () => ({ items: data[key], isReady: ready[key], setItems: failWrite, remove: failWrite })])),
    "../../lib/crmPro": crm, "../../lib/assistantIdentity": identities, "../../lib/contactLinks": contacts,
    "../../lib/scheduling": scheduling,
    "../../lib/cloud/useCloudIdentity": { useCloudIdentity: () => ({ mode: "cloud", identity, isReady: true }) }, "../../lib/storage": { makeId: failWrite },
  }, { URLSearchParams, window: { location: { search: query }, requestAnimationFrame(fn) { frames.set(++frameId, fn); return frameId; }, cancelAnimationFrame(id) { frames.delete(id); }, confirm: failWrite } }).default;
  const paint = () => runtime.render(page);
  const render = () => { let view = paint(); if (frames.size) { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); view = paint(); } return view; };
  const section = name => nodes(render()).find(n => n.props["aria-label"] === `${name} sales pipeline`);
  const button = label => nodes(render()).find(n => n.type === "Button" && text(n) === label);
  const field = label => nodes(render()).find(n => n.props["aria-label"] === label);
  const search = () => nodes(render()).find(n => n.type === "input" && n.props.type === "search");
  return { data, ready, paint, render, button, field, section, cards: name => nodes(section(name)).filter(n => n.type === "article"),
    click(label) { const control = button(label); assert.ok(control, label); control.props.onClick(); },
    search(value) { search().props.onChange({ target: { value } }); }, filter(label, value) { field(label).props.onChange({ target: { value } }); },
    enter() { search().props.onKeyDown({ key: "Enter", preventDefault() {}, currentTarget: { blur() { blurred++; } } }); }, blurred: () => blurred,
    account(patch) { identity = { ...identity, ...patch }; render(); },
  };
}

test("phone and desktop lists mount eight opportunities first and reveal eight together without changing totals", () => {
  const h = harness(); h.data.leads = Array.from({ length: 19 }, (_, i) => lead({ id: `lead-${i}`, priority: i === 18 ? "Urgent" : "Normal" }));
  for (const name of ["Mobile", "Desktop"]) assert.equal(h.cards(name).length, 8);
  assert.equal(h.cards("Mobile")[0].key, "lead-18"); assert.match(text(h.render()), /Showing 8 of 19/);
  for (const title of ["Pipeline overview", "Win / loss reporting"]) { const disclosure = nodes(h.render()).find(n => n.type === "details" && text(n.props.children[0]) === title); assert.ok(disclosure); assert.equal(disclosure.props.open, undefined); }
  h.click("Show more opportunities"); assert.equal(h.cards("Mobile").length, 16); h.click("Show more opportunities"); assert.equal(h.cards("Desktop").length, 19); assert.equal(h.button("Show more opportunities"), undefined);
  assert.match(text(h.render()), /19Open opportunities/);
});

test("all-word search matches work, site and normalized phone numbers and combines with stage/source filters", () => {
  const h = harness(); h.data.leads = Array.from({ length: 20 }, (_, i) => lead({ id: `lead-${i}`, name: i < 12 ? "Garage" : "Annex", stage: i < 12 ? "New Lead" : "Contacted", source: i < 6 ? "Builder" : "Referral" }));
  h.click("Show more opportunities"); h.search(" ENTRANCE garage "); assert.equal(h.cards("Mobile").length, 8); assert.match(text(h.render()), /Showing 8 of 12/);
  h.click("Show more opportunities"); h.filter("Filter by source", "Builder"); assert.equal(h.cards("Mobile").length, 6); h.filter("Filter by stage", "Contacted"); assert.equal(h.cards("Mobile").length, 0);
  h.click("Clear pipeline filters"); assert.equal(h.cards("Mobile").length, 8); h.search("07700900123 epsom"); assert.match(text(h.render()), /Showing 8 of 20/); h.enter(); assert.equal(h.blurred(), 1); h.search("undefined"); assert.equal(h.cards("Mobile").length, 0);
});

test("an exact lead link selects only its opaque saved identity even when names and stages match", () => {
  const id = "saved /?#+ &"; const h = harness(`?lead=${encodeURIComponent(id)}`); h.data.leads = [lead({ id }), lead({ id: "other" })];
  assert.match(text(h.paint()), /Loading sales pipeline/); assert.equal(h.cards("Mobile").length, 1); assert.equal(h.cards("Mobile")[0].key, id); assert.equal(h.cards("Desktop")[0].key, id);
  assert.match(text(h.render()), /Only this exact saved lead/); assert.match(text(h.render()), /2Open opportunities/);
  h.search("no match"); assert.equal(h.cards("Mobile").length, 0); h.click("Clear pipeline filters"); assert.equal(h.cards("Mobile")[0].key, id);
  h.click("Show all opportunities"); assert.equal(h.cards("Mobile").length, 2); assert.equal(h.button("Show all opportunities"), undefined);
});

test("missing blank and ambiguous lead links never fall back to another matching name", () => {
  for (const query of ["?lead=missing", "?lead=", "?lead=%20", "?lead=lead-1"]) {
    const h = harness(query); h.data.leads = [lead(), lead(), lead({ id: "other" })]; assert.equal(h.cards("Mobile").length, 0); assert.match(text(h.render()), /No other lead has been selected/);
    h.click("Clear pipeline filters"); assert.equal(h.cards("Mobile").length, 0); h.click("Show all opportunities"); assert.equal(h.cards("Mobile").length, 1); assert.equal(h.cards("Mobile")[0].key, "other");
  }
});

test("a selected lead becoming missing or ambiguous remains scoped rather than opening unrelated leads", () => {
  const h = harness("?lead=lead-1"); h.data.leads = [lead(), lead({ id: "other" })]; assert.equal(h.cards("Mobile").length, 1);
  h.data.leads = [lead({ id: "other" })]; assert.equal(h.cards("Mobile").length, 0); assert.match(text(h.render()), /unavailable/);
  h.data.leads = [lead(), lead(), lead({ id: "other" })]; assert.equal(h.cards("Mobile").length, 0);
});

test("missing and duplicate identities are withheld from cards and lead reporting", () => {
  const h = harness(); h.data.leads = [lead(), lead(), lead({ id: " " }), lead({ id: "other", stage: "Accepted" })];
  assert.equal(h.cards("Mobile").length, 1); assert.match(text(h.render()), /3 opportunities have missing or duplicate identities/); assert.match(text(h.render()), /0Open opportunities/); assert.match(text(h.render()), /1 won · 0 lost · 1 total/);
});

test("lead composer links validate and encode contact details without recording activity", () => {
  const h = harness(); h.data.leads = [lead({ phone: "+44 (7700) 900123", email: "work+site@example.test" })];
  const anchors = nodes(h.cards("Mobile")[0]).filter(n => n.type === "a"); assert.deepEqual(anchors.map(n => n.props.href), ["tel:+447700900123", "sms:+447700900123", "mailto:work%2Bsite@example.test"]);
  h.data.leads = [lead({ phone: "07700?body=Injected", email: "work@example.test?bcc=other@example.test" })];
  const card = h.cards("Mobile")[0]; assert.equal(nodes(card).filter(n => n.type === "a").length, 0); for (const label of ["Call Workshop", "Text Workshop", "Email Workshop"]) assert.equal(nodes(card).find(n => n.props["aria-label"] === label).props.disabled, true);
  assert.match(text(card), /Review phone format/); assert.match(text(card), /Review email format/);
});

test("source loading retains the selection and waits before interpreting deep links", () => {
  const h = harness("?lead=lead-1"); h.ready.leads = false; assert.match(text(h.render()), /Loading sales pipeline/); h.data.leads = [lead(), lead({ id: "other" })]; h.ready.leads = true; assert.equal(h.cards("Mobile").length, 1);
  h.ready.customers = false; assert.match(text(h.render()), /Loading sales pipeline/); h.ready.customers = true; assert.equal(h.cards("Mobile")[0].key, "lead-1");
});

test("account changes reset browsing without reviving the former account's filters", () => {
  const h = harness(); h.data.leads = Array.from({ length: 12 }, (_, i) => lead({ id: `lead-${i}` })); h.click("Show more opportunities");
  h.search("no match"); h.filter("Filter by source", "Builder");
  h.account({ organisationId: "org-2" }); assert.equal(h.cards("Mobile").length, 8); h.account({ organisationId: "org-1" }); assert.equal(h.cards("Mobile").length, 8);
});

test("desktop stage counts describe both visible and filtered cards instead of implying hidden stages are empty", () => {
  const h = harness(); h.data.leads = Array.from({ length: 9 }, (_, i) => lead({ id: `lead-${i}`, stage: i === 8 ? "Lost" : "New Lead" }));
  const stage = () => nodes(h.section("Desktop")).find(n => n.props["data-pipeline-stage"] === "Lost"); assert.match(text(stage()), /0 of 1/); assert.match(text(stage()), /Show more opportunities/); assert.doesNotMatch(text(stage()), /Drop an opportunity here/);
  h.click("Show more opportunities"); assert.match(text(stage()), /1 of 1/);
});

test("pipeline due counts honour valid future postponements and ignore malformed dates as due evidence", () => {
  const h = harness(); h.data.leads = [lead({ id: "future", stage: "Follow-up Due", followUpDate: "2026-12-01" }), lead({ id: "due", stage: "Follow-up Due", followUpDate: "2026-10-10" }), lead({ id: "bad", followUpDate: "2026-02-31" }), lead({ id: "closed", stage: "Lost", followUpDate: "2026-10-10" })];
  assert.match(text(h.render()), /1Follow-ups due/); assert.match(text(h.render()), /3Open opportunities/);
});

test("pipeline due day uses the device-local calendar rather than the UTC date", () => {
  const previous = process.env.TZ; process.env.TZ = "Pacific/Auckland";
  try { const h = harness(); h.data.leads = [lead({ followUpDate: "2026-10-12" })]; assert.match(text(h.render()), /1Follow-ups due/); }
  finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
