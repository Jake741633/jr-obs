import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildDailyProgressSummary,
  dailyProgressSignOffState,
  dailyProgressWarnings,
  normaliseDailyProgress,
} from "../lib/siteDiaryDailyProgress-core.mjs";

const page = readFileSync(new URL("../app/field/site-diary/page.tsx", import.meta.url), "utf8");
const navigation = readFileSync(new URL("../components/navigation.ts", import.meta.url), "utf8");

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
