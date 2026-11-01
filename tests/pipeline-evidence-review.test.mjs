import assert from "node:assert/strict";
import test from "node:test";
import { crm, pipeline } from "./helpers/follow-up-harness.mjs";
import { harness, lead, nodes, text } from "./helpers/lead-actions-harness.mjs";

const sources = ["Website", "Google", "Referral", "Builder", "Repeat customer", "Social media", "MyJobsQuote", "MyBuilder", "Checkatrade", "Other"];
const facts = (leads, documents = []) => pipeline.buildLeadPipeline(leads, documents, sources, "2026-10-11");
const quote = patch => ({ id: "quote-1", type: "Quote", status: "Accepted", ...patch });
const section = (h, name = "Mobile") => nodes(h.render()).find(n => n.props["aria-label"] === `${name} sales pipeline`);
const cards = (h, name = "Mobile") => nodes(section(h, name)).filter(n => n.type === "article");
const overview = h => nodes(h.render()).find(n => n.type === "details" && text(n.props.children[0]) === "Pipeline overview");
const figure = (h, label) => nodes(overview(h)).find(n => n.type === "Card" && nodes(n).some(child => child.type === "p" && text(child) === label));
const correction = (h, target = "New Lead") => h.edit("Reviewed stage for Workshop", target);

test("saved stage classification recognises supported aliases without accepting inherited or malformed values", () => {
  for (const stage of crm.crmLeadStages) assert.equal(crm.resolveLeadStage(stage), stage);
  for (const [saved, stage] of [["New enquiry", "New Lead"], ["Survey booked", "Survey Booked"], ["Quote required", "Survey Complete"], ["Quote sent", "Quote Sent"], ["Won", "Accepted"]]) assert.equal(crm.resolveLeadStage(saved), stage);
  for (const stage of ["constructor", "__proto__", "toString", "Imported", "", " New Lead ", null, undefined, {}, 0]) {
    assert.equal(crm.resolveLeadStage(stage), null); assert.equal(typeof crm.normaliseLeadStage(stage), "string");
    const result = facts([lead({ stage, source: "Builder" })]); assert.equal(result.openCount, 0); assert.equal(result.due, 0); assert.equal(result.builderCount, 0); assert.equal(result.conversionRate, null); assert.equal(result.stageReviews, 1); assert.equal(result.pipelineValue.pence, null);
  }
});

test("recorded monetary values remain exact and invalid estimates never turn into zero or contaminate totals", () => {
  for (const estimatedValue of [NaN, Infinity, -1, "100", undefined, null, {}, 1.234, Number.MAX_SAFE_INTEGER]) {
    const result = facts([lead({ estimatedValue }), lead({ id: "known", estimatedValue: 0.29 })]);
    assert.equal(result.pipelineValue.pence, 29); assert.equal(result.pipelineValue.missing, 1); assert.equal(result.pipelineValue.incomplete, true);
    assert.equal(facts([lead({ estimatedValue })]).pipelineValue.pence, null);
  }
  const result = facts([lead({ estimatedValue: 10.1 }), lead({ id: "second", estimatedValue: 0.2 }), lead({ id: "zero", estimatedValue: 0 })]);
  assert.equal(result.pipelineValue.pence, 1030); assert.equal(result.pipelineValue.incomplete, false); assert.equal(facts([lead({ estimatedValue: 0 })]).pipelineValue.pence, 0);
  const huge = facts([lead({ estimatedValue: 50_000_000_000_000 }), lead({ id: "other", estimatedValue: 50_000_000_000_000 })]); assert.equal(huge.pipelineValue.pence, null); assert.equal(huge.pipelineValue.overflow, true);
});

test("ambiguous lead identities and unknown stages cannot inflate open won builder or due figures", () => {
  const records = [lead({ id: "duplicate", stage: "Accepted" }), lead({ id: "duplicate", stage: "Lost" }), lead({ id: " " }), lead({ id: "unknown", stage: "Imported", source: "Builder" }), lead({ id: "won", stage: "Won" }), lead({ id: "lost", stage: "Lost" }), lead({ id: "open", source: "Builder" })];
  const snapshot = JSON.stringify(records), result = facts(records);
  assert.equal(result.unclassified, 4); assert.equal(result.openCount, 1); assert.equal(result.due, 1); assert.equal(result.builderCount, 1); assert.equal(result.conversionRate, 50); assert.equal(result.pipelineValue.pence, 10000); assert.equal(result.pipelineValue.incomplete, true); assert.equal(JSON.stringify(records), snapshot);
});

test("only supported stages and genuine decision records contribute to pipeline and win rates", () => {
  const stages = ["New enquiry", "Survey booked", "Quote required", "Quote sent", "Follow-up Due", "Won", "Completed", "Lost", "Cancelled"];
  const result = facts(stages.map((stage, index) => lead({ id: String(index), stage, estimatedValue: 100 })));
  assert.equal(result.openCount, 5); assert.equal(result.pipelineValue.pence, 50000); assert.equal(result.quotePipelineValue.pence, 20000); assert.equal(result.conversionRate, 2 / 3 * 100); assert.equal(result.unclassified, 0);
  assert.equal(facts([lead()]).conversionRate, null); assert.equal(facts([lead({ stage: "Lost" })]).conversionRate, 0);
});

test("invalid follow-up days are review evidence while valid snoozes and explicit due stages keep their meaning", () => {
  for (const followUpDate of ["2026-02-30", "2026-10-11T12:00:00Z", "tomorrow", " ", {}, 123]) {
    const result = facts([lead({ stage: "Follow-up Due", followUpDate })]); assert.equal(result.due, 0); assert.equal(result.dateReviews, 1);
  }
  const result = facts([lead({ id: "today", followUpDate: "2026-10-11" }), lead({ id: "due", stage: "Follow-up Due", followUpDate: "" }), lead({ id: "later", stage: "Follow-up Due", followUpDate: "2026-10-12" }), lead({ id: "closed", stage: "Accepted" }), lead({ id: "unset", followUpDate: undefined })]);
  assert.equal(result.due, 2); assert.equal(result.dateReviews, 0);
});

test("quote decision rates require globally unique document identities and supported types and statuses", () => {
  const docs = [quote(), quote({ id: "declined", status: "Declined" }), quote({ id: "duplicate" }), quote({ id: "duplicate", type: "Estimate" }), quote({ id: " " }), quote({ id: "unknown", status: "Won" }), quote({ id: "unknown-type", type: "Imported" }), quote({ id: "estimate", type: "Estimate", status: "Accepted" })];
  const result = facts([], docs); assert.equal(result.quoteRate, 50); assert.equal(result.quoteReviews, 5);
  assert.equal(facts([], [quote(), quote()]).quoteRate, null); assert.equal(facts([], [quote({ status: "Draft" })]).quoteRate, null);
});

test("unrecognised sources remain visible in reporting and unsupported priorities never inherit object properties", () => {
  const result = facts([lead({ id: "won", source: "Imported referral", stage: "Won", estimatedValue: 250 }), lead({ id: "open", source: "constructor", priority: "toString" })]);
  const group = result.sourcePerformance.find(item => item.source === "Source needs review"); assert.equal(group.total, 2); assert.equal(group.won, 1); assert.equal(group.value.pence, 25000); assert.equal(result.builderReviews, 1); assert.equal(pipeline.leadPriorityRank("constructor"), 0);
});

test("unknown-stage records stay visible on phone and desktop with an explicit correction control", () => {
  const h = harness(); h.data.leads = [lead({ stage: "Imported completion" })]; const original = JSON.stringify(h.data.leads);
  assert.equal(cards(h).length, 1); assert.equal(cards(h, "Desktop").length, 1); assert.match(text(cards(h)[0]), /Unrecognised stage: Imported completion/); assert.equal(h.field("Stage for Workshop"), undefined);
  assert.equal(h.field("Reviewed stage for Workshop").props.value, ""); assert.match(h.field("Reviewed stage for Workshop").props.className, /min-h-12/); assert.match(h.field("Reviewed stage for Workshop").props.className, /text-base/);
  const board = nodes(section(h, "Desktop")).find(n => n.props["data-pipeline-stage"] === "Stage needs review"); assert.match(text(board), /1 of 1/); assert.equal(board.props.onDrop, undefined); assert.equal(nodes(board).find(n => n.type === "article").props.draggable, false);
  assert.equal(h.button("Log activity").props.disabled, true); assert.equal(h.writes.length, 0); assert.equal(JSON.stringify(h.data.leads), original);
});

test("malformed stage priority source date and value fields render reviews without crashing or claiming zero", () => {
  for (const stage of ["constructor", "__proto__", {}, null]) {
    const h = harness(); h.data.leads = [lead({ stage, priority: {}, source: {}, followUpDate: {}, estimatedValue: NaN, updatedAt: null })];
    assert.match(text(h.render()), /Value unavailable/); assert.match(text(h.render()), /Date needs review/); assert.doesNotMatch(text(h.render()), /NaN|Invalid Date|Infinity/); assert.match(text(figure(h, "Open pipeline")), /Unavailable/); assert.match(text(figure(h, "Open opportunities")), /0 known/);
  }
});

test("review filtering reveals eight at a time without changing reporting or interpreting an exact link more broadly", () => {
  const h = harness(); h.data.leads = Array.from({ length: 20 }, (_, i) => lead({ id: `lead-${i}`, stage: i < 10 ? "Imported" : "New Lead", estimatedValue: i >= 10 && i < 19 ? NaN : 100 }));
  h.click("Show records needing review"); assert.equal(cards(h).length, 8); h.click("Show more opportunities"); assert.equal(cards(h).length, 16); h.click("Show more opportunities"); assert.equal(cards(h).length, 19); assert.match(text(figure(h, "Open opportunities")), /10 known/); assert.match(text(figure(h, "Open pipeline")), /£100.00.*incomplete/);
  const id = "saved /?#+ &", scoped = harness(`?lead=${encodeURIComponent(id)}`); scoped.data.leads = [lead({ id, stage: "Imported" }), lead({ id: "other", stage: "Imported" })]; scoped.click("Show records needing review"); assert.equal(cards(scoped).length, 1); assert.equal(cards(scoped)[0].key, id); assert.equal(scoped.writes.length, 0);
});

test("rates with no decisions and money with no usable values state the evidence gap", () => {
  const h = harness(); h.data.leads = []; assert.match(text(overview(h)), /No decisions/); assert.doesNotMatch(text(overview(h)), /0.0%/);
  h.data.leads = [lead({ estimatedValue: -1 })]; assert.match(text(figure(h, "Open pipeline")), /UnavailableOpen pipelineKnown subtotal/);
  h.data.documents = [quote(), quote()]; assert.match(text(overview(h)), /quote win rate is incomplete/); assert.match(text(overview(h)), /quotes Unavailable/);
  h.data.leads = [lead({ estimatedValue: 0 })]; assert.match(text(figure(h, "Open pipeline")), /£0.00Open pipeline/);
});

test("refreshed corrected records replace review states and figures without changing the saved data", () => {
  const h = harness(); h.data.leads = [lead({ stage: "Imported", estimatedValue: NaN, followUpDate: "bad" })]; h.render();
  h.data.leads = [lead({ stage: "Accepted", estimatedValue: 250 })]; assert.equal(h.field("Reviewed stage for Workshop"), undefined); assert.equal(h.button("Show records needing review"), undefined); assert.match(text(overview(h)), /100.0%/); assert.equal(h.writes.length, 0);
});

test("correcting an unknown stage needs confirmation and records the actual original stage", () => {
  for (const target of ["New Lead", "Contacted", "Completed", "Accepted", "Follow-up Due"]) {
    const h = harness(); h.data.leads = [lead({ stage: "Imported completion", lastContactAt: "old contact", completedAt: "old completion", notes: "Keep notes" })]; correction(h, target); assert.equal(h.writes.length, 0); assert.match(text(h.render()), /Your chosen stage will replace it after confirmation/);
    const confirm = h.button("Confirm stage change").props.onClick; confirm(); confirm(); assert.equal(h.writes.length, 2); assert.equal(h.writes[0].collection, "leads"); assert.equal(h.data.leads[0].stage, target); assert.equal(h.data.leads[0].notes, "Keep notes"); assert.match(h.data.activities[0].summary, /Saved stage correction: Unrecognised stage: Imported completion →/);
    assert.equal(h.data.leads[0].lastContactAt, "old contact"); assert.equal(h.data.leads[0].completedAt, "old completion"); assert.equal(h.data.leads[0].nextAction, "Book a visit");
  }
});

test("discarding a proposed stage correction invalidates the old confirm without changing records", () => {
  const h = harness(); h.data.leads = [lead({ stage: "Imported" })]; correction(h); const confirm = h.button("Confirm stage change").props.onClick; h.click("Discard lead action"); confirm(); assert.equal(h.writes.length, 0); assert.equal(h.data.leads[0].stage, "Imported");
});

test("a failed correction keeps the reviewed choice and retry timestamp without duplicate writes", () => {
  const h = harness(); h.data.leads = [lead({ stage: "Imported" })]; correction(h, "Contacted"); h.failures.add("leads:update"); h.click("Confirm stage change"); assert.equal(h.writes.length, 0); assert.match(text(h.render()), /draft is retained/); const at = h.attempts[0].item.updatedAt;
  h.failures.clear(); h.clock("2026-10-12T12:00:00Z"); h.click("Confirm stage change"); assert.equal(h.data.leads[0].updatedAt, at); assert.equal(h.data.leads[0].lastContactAt, undefined); assert.equal(h.data.leads[0].completedAt, undefined); assert.equal(h.data.activities.length, 1); assert.equal(h.data.activities[0].completedAt, at);
});

test("partial correction history remains retryable after the reviewed card leaves the filter and never rewinds later stages", () => {
  const h = harness(); h.data.leads = [lead({ stage: "Imported" })]; h.click("Show records needing review"); correction(h); h.failures.add("activities:create"); h.click("Confirm stage change"); assert.equal(cards(h).length, 0); assert.match(text(h.render()), /Retrying will only save the history/);
  h.data.leads = [{ ...h.data.leads[0], stage: "Accepted", notes: "Later note" }]; h.ready.customers = false; assert.equal(h.button("Retry lead history").props.disabled, true); h.ready.customers = true; h.failures.clear(); h.click("Retry lead history"); assert.equal(h.writes.length, 2); assert.equal(h.data.leads[0].stage, "Accepted"); assert.equal(h.data.leads[0].notes, "Later note"); assert.match(h.data.activities[0].summary, /Imported → New Lead/);
});

test("stale correction controls cannot adopt a changed recognised missing or ambiguous lead", () => {
  for (const change of ["known", "unknown", "missing", "duplicate"]) {
    const h = harness(); h.data.leads = [lead({ stage: "Imported" })]; const choose = h.field("Reviewed stage for Workshop").props.onChange;
    h.data.leads = change === "missing" ? [] : change === "duplicate" ? [lead({ stage: "Imported" }), lead({ stage: "Imported" })] : [lead({ stage: change === "known" ? "Completed" : "Another import" })]; h.render(); choose({ target: { value: "New Lead" } }); assert.equal(h.writes.length, 0, change); assert.equal(h.button("Confirm stage change"), undefined);
  }
  for (const target of ["", "constructor", "Imported", "Won"]) { const h = harness(); h.data.leads = [lead({ stage: "Imported" })]; correction(h, target); assert.equal(h.button("Confirm stage change"), undefined); assert.equal(h.writes.length, 0); }
});

test("correction saves recheck the source inside the durable update and preserve unrelated value changes", () => {
  const h = harness(); h.data.leads = [lead({ stage: "Imported" })]; correction(h); h.beforeUpdate(() => { h.data.leads = [lead({ stage: "Completed" })]; }); h.click("Confirm stage change"); assert.equal(h.writes.length, 0); assert.equal(h.data.leads[0].stage, "Completed");
  const newer = harness(); newer.data.leads = [lead({ stage: "Imported" })]; correction(newer); newer.data.leads = [{ ...newer.data.leads[0], estimatedValue: 600 }]; newer.render(); newer.click("Confirm stage change"); assert.equal(newer.data.leads[0].estimatedValue, 600); assert.equal(newer.data.leads[0].stage, "New Lead");
});

test("account role loading and unmount boundaries invalidate retained correction callbacks", () => {
  for (const change of ["account", "role", "loading", "unmount"]) {
    const h = harness(); h.data.leads = [lead({ stage: "Imported" })]; correction(h); const confirm = h.button("Confirm stage change").props.onClick;
    if (change === "account") h.account({ organisationId: "other" }); if (change === "role") h.account({ role: "electrician" }); if (change === "loading") { h.ready.leads = false; h.render(); } if (change === "unmount") h.unmount(); confirm(); assert.equal(h.writes.length, 0, change);
  }
});
