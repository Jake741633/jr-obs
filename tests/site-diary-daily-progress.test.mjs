import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildDailyProgressSummary,
  dailyProgressSignOffState,
  dailyProgressWarnings,
  normaliseDailyProgress,
} from "../lib/siteDiaryDailyProgress-core.mjs";
import { siteDiaryAttentionItems, siteDiaryAttentionSummary } from "../lib/siteDiaryAttention-core.mjs";

const page = readFileSync(new URL("../app/field/site-diary/page.tsx", import.meta.url), "utf8");
const navigation = readFileSync(new URL("../components/navigation.ts", import.meta.url), "utf8");
const aiPage = readFileSync(new URL("../app/ai/page.tsx", import.meta.url), "utf8");
const attentionPanel = readFileSync(new URL("../components/ai/SiteDiaryAttentionPanel.tsx", import.meta.url), "utf8");

test("daily progress normalises legacy diary records without losing existing fields", () => {
  const legacy = { id: "diary-1", workCompleted: "First fix complete", materialsUsed: "Cable" };
  const normalised = normaliseDailyProgress(legacy);
  assert.equal(normalised.id, "diary-1");
  assert.equal(normalised.workCompleted, "First fix complete");
  assert.equal(normalised.plantAndEquipment, "");
  assert.equal(normalised.deliveriesReceived, "");
  assert.equal(normalised.toolboxTalks, "");
  assert.equal(normalised.dailySummary, "");
});

test("daily progress summary includes operational and safety detail", () => {
  const summary = buildDailyProgressSummary({
    workCompleted: "Installed containment",
    materialsUsed: "20 mm conduit",
    plantAndEquipment: "Podium steps",
    deliveriesReceived: "Distribution board",
    delays: "Awaiting builder opening",
    issuesAndRisks: "Keep escape route clear",
    toolboxTalks: "Manual handling",
    followUpActions: "Return for cable pull",
  });
  assert.match(summary, /Work completed: Installed containment/);
  assert.match(summary, /Plant\/equipment: Podium steps/);
  assert.match(summary, /Deliveries: Distribution board/);
  assert.match(summary, /H&S\/issues: Keep escape route clear/);
  assert.match(summary, /Next actions: Return for cable pull/);
});

test("daily progress sign-off and warnings remain explicit", () => {
  assert.deepEqual(dailyProgressSignOffState({ engineerSignatureName: "Jake", engineerSignedAt: "2026-08-02T09:00:00Z", customerSignOffName: "Client", customerSignedAt: "2026-08-02T09:05:00Z" }), { engineerSigned: true, customerSigned: true });
  assert.deepEqual(dailyProgressWarnings({ delays: "Access delayed", issuesAndRisks: "Open floor void", followUpActions: "Call builder", engineerSignatureName: "", engineerSignedAt: "" }), ["Delay recorded", "H&S or site issue recorded", "Follow-up action outstanding", "Engineer signature missing"]);
});

test("mobile site diary reuses cloud-aware collections and existing job timeline", () => {
  assert.match(page, /useSiteDiariesCollection\(\)/);
  assert.match(page, /useJobTimelineCollection\(\)/);
  assert.match(page, /buildDailyProgressSummary/);
  assert.match(page, /siteDiaryTimelineEntry/);
  assert.match(page, /type="button"/);
  assert.match(page, /Save daily progress/);
  assert.match(navigation, /\["Mobile Site Diary", "\/field\/site-diary"\]/);
});

test("site diary attention items retain source links and prioritise safety and delays", () => {
  const entries = [{
    id: "diary-1",
    jobId: "job-1",
    workDate: "2026-08-02",
    updatedAt: "2026-08-02T16:00:00Z",
    materialsRequired: "25 mm conduit",
    followUpActions: "Call builder",
    delays: "No access to riser",
    issuesAndRisks: "Open floor void",
    customerInstructions: "Move socket",
    builderInstructions: "Return Monday",
  }];
  const items = siteDiaryAttentionItems(entries);
  assert.equal(items.length, 6);
  assert.equal(items[0].priority, "Urgent");
  assert.equal(items[0].jobId, "job-1");
  assert.equal(items[0].sourceId, "diary-1");
  assert.equal(items[0].sourceType, "SiteDiaryEntry");
  assert.ok(items.some((item) => item.kind === "Materials" && item.href === "/purchases"));
  assert.ok(items.some((item) => item.kind === "Safety" && item.href === "/rams"));
});

test("site diary attention summary reports actionable categories", () => {
  const summary = siteDiaryAttentionSummary([
    { id: "one", jobId: "job-1", workDate: "2026-08-02", delays: "Delay", materialsRequired: "Cable" },
    { id: "two", jobId: "job-2", workDate: "2026-08-02", customerRequests: "Call customer", builderInstructions: "Confirm access" },
  ]);
  assert.deepEqual({ total: summary.total, urgent: summary.urgent, high: summary.high, materials: summary.materials, customerActions: summary.customerActions, builderActions: summary.builderActions }, {
    total: 4,
    urgent: 1,
    high: 1,
    materials: 1,
    customerActions: 1,
    builderActions: 1,
  });
});

test("AI Command Centre renders cloud-aware site diary intelligence", () => {
  assert.match(attentionPanel, /useSiteDiariesCollection\(\)/);
  assert.match(attentionPanel, /siteDiaryAttentionSummary/);
  assert.match(attentionPanel, /No duplicate tasks are created/);
  assert.match(aiPage, /import \{ SiteDiaryAttentionPanel \}/);
  assert.match(aiPage, /<SiteDiaryAttentionPanel \/>/);
});
