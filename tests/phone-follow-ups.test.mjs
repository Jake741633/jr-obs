import assert from "node:assert/strict";
import test from "node:test";
import { crm, rules, contacts, load, hookRuntime, jsx, nodes, text, FixedDate } from "./helpers/follow-up-harness.mjs";

const customer = (patch = {}) => ({ id: "customer-1", name: "Example customer", phone: "07700 900123", email: "customer@example.test", ...patch });
const lead = (patch = {}) => ({ id: "lead-1", name: "Workshop enquiry", phone: "07700 900123", email: "customer@example.test", stage: "New Lead", workRequired: "Rear entrance lighting", nextAction: "Book a visit", priority: "Normal", estimatedValue: 100, createdAt: "2026-10-10T12:00:00Z", updatedAt: "2026-10-10T12:00:00Z", ...patch });
const quote = (patch = {}) => ({ id: "quote-1", customerId: "customer-1", title: "Workshop quote", number: "Q-1", type: "Quote", status: "Sent", items: [{ quantity: 1, unitPrice: 100 }], createdAt: "2026-10-10T12:00:00Z", updatedAt: "2026-10-10T12:00:00Z", ...patch });
const profile = (patch = {}) => ({ id: "profile-1", customerId: "customer-1", nextFollowUpDate: "2026-10-11", followUpReason: "Annual lighting check", ...patch });
const emptyData = () => ({ leads: [], leadActivities: [], documents: [], customers: [], profiles: [] });
const build = data => crm.buildFollowUpCentre({ ...emptyData(), ...data, now: new FixedDate() });

function harness() {
  const runtime = hookRuntime(), data = { ...emptyData(), interactions: [], settings: [] }, ready = Object.fromEntries(Object.keys(data).map(key => [key, true]));
  let identity = { organisationId: "org-1", userId: "user-1", role: "owner" }, blurred = 0, calculations = 0;
  const failWrite = () => assert.fail("Browsing, search and recommendations must not save records");
  const hooks = { leads: "useSalesLeadsCollection", leadActivities: "useLeadActivitiesCollection", documents: "usePricingDocumentsCollection", customers: "useCustomersCollection", profiles: "useCustomerProfilesCollection", interactions: "useCustomerInteractionsCollection", settings: "useCrmFollowUpSettingsCollection" };
  const page = load("app/crm/follow-ups/page.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx }, react: runtime.hooks, "lucide-react": {}, "next/link": { default: "Link" },
    "../../../components/ui/Button": { Button: "Button" }, "../../../components/ui/Card": { Card: "Card" }, "../../../components/ui/PageHeader": { PageHeader: "PageHeader" }, "../../../components/crm/FollowUpRules": { FollowUpRules: "Rules" },
    "../../../components/crm/FollowUpActions": { useFollowUpActions: () => ({ panel: null, canStart: true, openContact: failWrite, openPostpone: failWrite }) },
    "../../../lib/cloud/useCloudIdentity": { useCloudIdentity: () => ({ identity, mode: "cloud", isReady: true }) },
    "../../../lib/cloud/coreBusinessCollections": Object.fromEntries(Object.entries(hooks).map(([key, hook]) => [hook, () => ({ items: data[key], isReady: ready[key], createItem: failWrite, updateItem: failWrite, setItems: failWrite })])),
    "../../../lib/crmPro": { ...crm, buildFollowUpCentre(input) { calculations++; return crm.buildFollowUpCentre(input); } }, "../../../lib/crmFollowUpSettings": rules, "../../../lib/contactLinks": contacts, "../../../lib/storage": { makeId: failWrite },
  }).default;
  const render = () => runtime.render(page);
  const queue = () => nodes(render()).find(n => n.props["aria-label"] === "Follow-up queue");
  const button = label => nodes(render()).find(n => n.type === "Button" && text(n) === label);
  const search = () => nodes(render()).find(n => n.type === "input" && n.props.type === "search");
  return { data, ready, render, queue, button, cards: () => nodes(queue()).filter(n => n.type === "Card"), blurred: () => blurred, calculations: () => calculations,
    click(label) { const control = button(label); assert.ok(control, label); control.props.onClick(); }, search(value) { search().props.onChange({ target: { value } }); },
    reason(value) { nodes(render()).find(n => n.props["aria-label"] === "Filter follow-ups by reason").props.onChange({ target: { value } }); },
    enter() { search().props.onKeyDown({ key: "Enter", preventDefault() {}, currentTarget: { blur() { blurred++; } } }); },
    recommendations() { return nodes(render()).find(n => n.type === "details" && text(n.props.children[0]) === "Who to contact today"); },
    overview() { return nodes(render()).find(n => n.type === "details" && text(n.props.children[0]) === "Follow-up overview"); },
    account(patch) { identity = { ...identity, ...patch }; render(); },
  };
}

test("phone follow-up queue starts with eight ranked cards and reveals eight at a time", () => {
  const h = harness(); h.data.leads = Array.from({ length: 19 }, (_, i) => lead({ id: `lead-${i}`, name: `Enquiry ${i}`, estimatedValue: i * 10 }));
  assert.equal(h.cards().length, 8); assert.match(text(h.queue()), /Showing 8 of 19 matching/); assert.match(text(h.cards()[0]), /Enquiry 18/);
  h.click("Show more follow-ups"); assert.equal(h.cards().length, 16); h.click("Show more follow-ups"); assert.equal(h.cards().length, 19); assert.equal(h.button("Show more follow-ups"), undefined);
  assert.equal(h.overview().props.open, undefined); assert.equal(h.recommendations().props.open, undefined); assert.match(text(h.overview()), /19Follow-ups surfaced/);
});

test("follow-up search combines words and normalized phone numbers with reason filters without changing full totals", () => {
  const h = harness(); h.data.leads = Array.from({ length: 20 }, (_, i) => lead({ id: `lead-${i}`, name: i < 12 ? `Garage ${i}` : `Annex ${i}`, stage: i < 12 ? "New Lead" : "Follow-up Due" }));
  h.click("Show more follow-ups"); h.search(" GARAGE rear "); assert.equal(h.cards().length, 8); assert.match(text(h.queue()), /of 12 matching/); assert.match(text(h.overview()), /20Follow-ups surfaced/);
  h.click("Show more follow-ups"); assert.equal(h.cards().length, 12); h.reason("No response"); assert.match(text(h.queue()), /No follow-ups match/); assert.equal(nodes(h.recommendations()).filter(n => n.type === "Link").length, 0);
  h.click("Clear follow-up filters"); assert.equal(h.cards().length, 8); assert.match(text(h.queue()), /of 20 matching/); h.search("07700900123"); assert.match(text(h.queue()), /of 20 matching/); h.enter(); assert.equal(h.blurred(), 1);
  h.search("undefined"); assert.match(text(h.queue()), /Showing 0 of 0/);
});

test("recommendations follow active filters and open exact source records even when outside the first eight cards", () => {
  const h = harness(); h.data.leads = Array.from({ length: 8 }, (_, i) => lead({ id: `bad-${i}`, name: `Bad ${i}`, phone: "invalid", email: "invalid", estimatedValue: 10000, priority: "Urgent" }));
  const id = "saved /?#+ &"; h.data.leads.push(lead({ id, name: "Matching workshop" }));
  assert.equal(h.cards().length, 8); assert.doesNotMatch(text(h.queue()), /Matching workshop/);
  const links = nodes(h.recommendations()).filter(n => n.type === "Link"); assert.equal(links.length, 1); assert.equal(links[0].props.href, `/leads?lead=${encodeURIComponent(id)}`); assert.ok(!links[0].props.href.startsWith("#"));
  h.search("Matching"); assert.equal(h.cards().length, 1); assert.match(text(h.recommendations()), /Matching workshop/); h.search("Bad"); assert.match(text(h.recommendations()), /No follow-ups with a supported contact/);
});

test("follow-up call text and email links validate and encode recipients while invalid values remain reviewable", () => {
  const h = harness(); h.data.leads = [lead({ phone: "+44 (7700) 900123", email: "customer+work@example.test" })];
  const card = h.cards()[0], link = label => nodes(card).find(n => n.type === "a" && text(n) === label);
  assert.equal(link("Call").props.href, "tel:+447700900123"); assert.equal(link("Text").props.href, "sms:+447700900123"); assert.equal(link("Email").props.href, `mailto:customer%2Bwork@example.test?subject=${encodeURIComponent("JR Electrical Services follow-up")}`);
  h.data.leads = [lead({ phone: "07700 900123?body=Injected", email: "customer@example.test?bcc=other@example.test" })];
  const invalid = h.cards()[0]; assert.equal(nodes(invalid).filter(n => n.type === "a").length, 0);
  for (const label of ["Call", "Text", "Email"]) assert.equal(nodes(invalid).find(n => n.type === "button" && text(n) === label).props.disabled, true);
  assert.match(text(invalid), /Review phone format/); assert.match(text(invalid), /Review email format/); assert.equal(nodes(invalid).find(n => n.type === "Button" && text(n) === "Log contact").props.disabled, false, "Completed site visits can be logged without a supported composer link");
  assert.match(text(h.overview()), /0Ready to contact/);
});

test("rule errors pause the queue and preserve the mounted rule editor; incomplete sources show loading", () => {
  for (const items of [[{ ...crm.defaultCrmFollowUpSettings, noResponseDays: -1 }], [{ ...crm.defaultCrmFollowUpSettings, highValueThreshold: Infinity }], [{ ...crm.defaultCrmFollowUpSettings, id: " " }], [crm.defaultCrmFollowUpSettings, { ...crm.defaultCrmFollowUpSettings, id: "other" }]]) {
    const h = harness(); h.data.leads = [lead()]; h.data.settings = items; const view = h.render(); assert.match(text(view), /queue is paused/); assert.equal(h.calculations(), 0); assert.equal(h.queue(), undefined); assert.equal(view.props.children[1].type, "Rules");
  }
  const h = harness(); h.data.leads = [lead()]; const before = h.render().props.children[1]; h.ready.profiles = false; const loading = h.render(); assert.match(text(loading), /Loading follow-up centre/); assert.equal(loading.props.children[1].type, before.type); assert.equal(loading.props.children[1].key, before.key);
});

test("account changes clear follow-up browsing filters instead of reviving another account's search", () => {
  const h = harness(); h.data.leads = Array.from({ length: 12 }, (_, i) => lead({ id: `lead-${i}` })); h.click("Show more follow-ups"); h.search("no match"); h.reason("No response");
  h.account({ organisationId: "org-2" }); assert.equal(h.cards().length, 8); h.search("other search"); h.account({ organisationId: "org-1" }); assert.equal(h.cards().length, 8); assert.equal(nodes(h.render()).find(n => n.type === "input").props.value, "");
});

test("future lead snoozes suppress every surfaced stage until their saved day without mutating records", () => {
  for (const stage of ["New Lead", "Contacted", "Follow-up Due", "Quote Sent", "Lost"]) {
    const original = lead({ stage, followUpDate: "2026-10-12", lastContactAt: "2026-10-01T12:00:00Z" });
    const snapshot = JSON.stringify(original); assert.equal(build({ leads: [original] }).length, 0, stage); assert.equal(JSON.stringify(original), snapshot);
    assert.equal(build({ leads: [{ ...original, followUpDate: "2026-10-11" }] }).length, 1, stage);
    assert.equal(build({ leads: [{ ...original, followUpDate: "2026-10-10" }] }).length, 1, stage);
  }
  assert.equal(build({ leads: [lead({ stage: "Lost", lostFollowUpCompletedAt: "2026-10-10T12:00:00Z" })] }).length, 0);
  for (const followUpDate of ["invalid", "2026-13-01", "2026-11-31"]) assert.equal(build({ leads: [lead({ followUpDate })] }).length, 1, "A malformed date is not evidence of a future snooze");
  assert.equal(build({ documents: [quote({ nextFollowUpDate: "2026-10-12" })], profiles: [profile({ nextFollowUpDate: "2026-10-12" })], customers: [customer()] }).length, 0);
});

test("unsupported contact strings no longer earn a contactability priority boost", () => {
  const normal = { phone: "07700 900123", email: "customer@example.test" }, invalid = { phone: "unsupported", email: "unsupported" };
  for (const make of [contact => ({ leads: [lead(contact)] }), contact => ({ documents: [quote()], customers: [customer(contact)] }), contact => ({ profiles: [profile()], customers: [customer(contact)] })]) {
    const valid = build(make(normal)), unsupported = build(make(invalid)); assert.equal(valid.length, 1); assert.equal(unsupported.length, 1); assert.equal(valid[0].priorityScore - unsupported[0].priorityScore, 15);
  }
});

test("a saved quote due day resurfaces that morning even before 24 hours have elapsed", () => {
  const recent = quote({ lastFollowUpAt: "2026-10-10T18:00:00Z", nextFollowUpDate: "2026-10-11" });
  const due = build({ documents: [recent], customers: [customer()] }); assert.equal(due.length, 1); assert.equal(due[0].dueDate, "2026-10-11");
  assert.equal(build({ documents: [{ ...recent, nextFollowUpDate: "2026-10-12" }], customers: [customer()] }).length, 0);
  assert.equal(build({ documents: [{ ...recent, nextFollowUpDate: "" }], customers: [customer()] }).length, 0, "Unscheduled quotes still need their initial waiting period");
  assert.equal(build({ documents: [quote({ nextFollowUpDate: "invalid" })], customers: [customer()] }).length, 1, "Malformed dates cannot hide an aged quote indefinitely");
});

test("quote and customer recommendations retain opaque saved identities in record links", () => {
  const id = "saved /?#+ &";
  const quotes = build({ documents: [quote({ id, customerId: id })], customers: [customer({ id })] }); assert.equal(quotes[0].href, `/quotes/${encodeURIComponent(id)}`);
  const customers = build({ profiles: [profile({ customerId: id })], customers: [customer({ id })] }); assert.equal(customers[0].href, `/customers/${encodeURIComponent(id)}`);
});

const activity = (patch = {}) => ({ id: "activity-1", leadId: "lead-1", type: "Call", summary: "Discussed the enquiry", completedBy: "Office", completedAt: "2026-10-11T11:00:00Z", createdAt: "2026-10-11T11:00:00Z", ...patch });

test("notes stage history and general edits cannot postpone an unanswered lead or unlinked quote", () => {
  for (const stage of ["Contacted", "Quote Sent"]) {
    const original = lead({ stage, createdAt: "2026-10-08T12:00:00Z", updatedAt: "2026-10-08T12:00:00Z" });
    const before = build({ leads: [original] })[0];
    const data = { leads: [{ ...original, updatedAt: "2026-10-11T11:00:00Z", notes: "Internal update" }], leadActivities: [activity({ type: "Note" }), activity({ id: "stage-1", type: "Stage change" })] };
    const snapshot = JSON.stringify(data), after = build(data)[0];
    assert.ok(after, stage); assert.equal(after.reason, before.reason); assert.equal(after.ageDays, 3); assert.equal(after.ageBasis, "enquiry"); assert.equal(after.priorityScore, before.priorityScore); assert.equal(JSON.stringify(data), snapshot);
  }
});

test("each genuine completed contact channel restarts the unanswered interval", () => {
  for (const type of ["Call", "Text", "Email", "WhatsApp", "Site visit"]) {
    const source = lead({ stage: "Contacted", createdAt: "2026-10-01T12:00:00Z" });
    const history = activity({ type });
    assert.equal(build({ leads: [source], leadActivities: [history] }).length, 0, type);
    const due = build({ leads: [{ ...source, stage: "Follow-up Due" }], leadActivities: [history] })[0];
    assert.equal(due.ageDays, 0); assert.equal(due.ageBasis, "contact");
    const aged = build({ leads: [source], leadActivities: [{ ...history, completedAt: "2026-10-09T12:00:00Z" }] })[0];
    assert.equal(aged.reason, "No response"); assert.equal(aged.ageDays, 2);
  }
});

test("newest genuine contact wins across the lead and unsorted history using actual instants", () => {
  const source = lead({ stage: "Follow-up Due", lastContactAt: "2026-10-01T12:00:00Z" });
  const histories = [activity({ id: "older", completedAt: "2026-10-09T12:30:00+02:00" }), activity({ id: "newer", completedAt: "2026-10-09T11:30:00-01:00" })];
  for (const leadActivities of [histories, histories.toReversed()]) {
    const item = build({ leads: [source], leadActivities })[0]; assert.equal(item.ageDays, 1); assert.equal(item.ageBasis, "contact");
  }
  const item = build({ leads: [{ ...source, lastContactAt: "2026-10-11T11:00:00Z" }], leadActivities: histories })[0]; assert.equal(item.ageDays, 0); assert.equal(item.ageBasis, "contact");
});

test("malformed and future contact dates cannot hide older genuine contact or enquiry evidence", () => {
  for (const invalid of [undefined, null, "", "invalid", "2026-02-30", "2026-02-30T11:00:00Z", "2026-13-01T11:00:00Z", "2026-10-11T25:00:00Z", "2026-10-11T11:00:00", "2026-10-11T13:00:00Z", "2026-10-12", "2030-01-01T00:00:00Z", 123, {}]) {
    const source = lead({ stage: "Contacted", lastContactAt: invalid, createdAt: "2026-10-08T12:00:00Z", updatedAt: "2026-10-11T11:00:00Z" });
    const leadActivities = [activity({ completedAt: invalid }), activity({ id: "valid", completedAt: "2026-10-09T12:00:00Z" })];
    const known = build({ leads: [source], leadActivities })[0]; assert.equal(known?.ageDays, 2, String(invalid)); assert.equal(known.ageBasis, "contact");
    const fallback = build({ leads: [source], leadActivities: leadActivities.slice(0, 1) })[0]; assert.equal(fallback?.ageDays, 3, String(invalid)); assert.equal(fallback.ageBasis, "enquiry");
  }
});

test("contact on another lead and unsupported activity types do not change this lead's age", () => {
  const source = lead({ stage: "Contacted", createdAt: "2026-10-08T12:00:00Z" });
  const item = build({ leads: [source], leadActivities: [activity({ leadId: "other-lead" }), activity({ id: "unknown-type", type: "Imported update" })] })[0];
  assert.equal(item.reason, "No response"); assert.equal(item.ageDays, 3); assert.equal(item.ageBasis, "enquiry");
});

test("date-only contact on the current day remains valid before noon", () => {
  const items = crm.buildFollowUpCentre({ ...emptyData(), leads: [lead({ lastContactAt: "2026-10-11" })], now: new FixedDate("2026-10-11T08:00:00") });
  assert.equal(items[0].ageDays, 0); assert.equal(items[0].ageBasis, "contact");
});

test("phone cards and recommendations distinguish contact age from enquiry age", () => {
  const h = harness();
  h.data.leads = [lead({ id: "no-contact", name: "Older enquiry", createdAt: "2026-10-08T12:00:00Z", updatedAt: "2026-10-11T11:00:00Z" }), lead({ id: "contacted", name: "Contacted enquiry", lastContactAt: "2026-10-10T12:00:00Z" })];
  h.data.leadActivities = [activity({ leadId: "no-contact", type: "Note" })];
  const cards = h.cards(); assert.match(text(cards[0]), /Older enquiry/); assert.match(text(cards[0]), /3 days since enquiry/); assert.match(text(cards[1]), /1 day since contact/);
  assert.match(text(h.recommendations()), /3 days since enquiry/); assert.match(text(h.recommendations()), /1 day since contact/);
});

test("surfaced leads without valid age evidence say unavailable instead of claiming zero days", () => {
  for (const createdAt of ["", "invalid", "2026-02-30T12:00:00Z", "2030-01-01T00:00:00Z"]) {
    const h = harness(); h.data.leads = [lead({ createdAt, updatedAt: "2026-10-11T11:00:00Z", lastContactAt: "invalid" })];
    assert.match(text(h.cards()[0]), /Age unavailable/); assert.doesNotMatch(text(h.cards()[0]), /0 days/); assert.match(text(h.recommendations()), /Age unavailable/); assert.doesNotMatch(text(h.recommendations()), /0 days/);
  }
});
