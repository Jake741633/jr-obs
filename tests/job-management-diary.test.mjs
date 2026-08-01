import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  normaliseSiteDiaryEntry,
  siteDiaryDurationHours,
  siteDiaryTimelineEntry,
} from "../lib/jobManagement-core.mjs";
import { cloudRowsToCache, linkedSourceIds, tenantListQuery } from "../lib/cloud/repository-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const legacyEntry = {
  id: "diary-1",
  jobId: "job-1",
  workDate: "2026-08-04",
  startedAt: "08:00",
  finishedAt: "16:30",
  breakMinutes: 30,
  completedBy: "Jake",
  workCompleted: "Completed first-fix socket wiring.",
  delays: "Kitchen wall was not ready.",
  customerRequests: "Move one socket 150 mm.",
  materialsUsed: "2.5 mm cable and boxes",
  voiceNotes: "Return after plastering.",
  createdAt: "2026-08-04T16:31:00.000Z",
  updatedAt: "2026-08-04T16:31:00.000Z",
};

test("legacy diary entries round-trip into every Job Management Pro diary field without losing source values", () => {
  const entry = normaliseSiteDiaryEntry(legacyEntry);
  assert.equal(legacyEntry.customerInstructions, undefined);
  assert.deepEqual(entry.staffPresent, []);
  assert.equal(entry.customerInstructions, "Move one socket 150 mm.");
  assert.equal(entry.voiceNoteTranscript, "Return after plastering.");
  assert.equal(entry.issuesAndRisks, "Kitchen wall was not ready.");
  for (const field of ["builderInstructions", "materialsRequired", "weather", "followUpActions", "otherStaffPresent"]) assert.equal(entry[field], "");
  assert.deepEqual(entry.photoDocumentIds, []);
  assert.deepEqual(cloudRowsToCache([{ source_id: entry.id, version: 1, payload: entry }]), [entry]);
  assert.deepEqual(linkedSourceIds(entry), { customerSourceId: undefined, jobSourceId: "job-1" });
});

test("site diary labour duration handles breaks, open timers and invalid reverse times safely", () => {
  assert.equal(siteDiaryDurationHours(legacyEntry), 8);
  assert.equal(siteDiaryDurationHours({ ...legacyEntry, finishedAt: "" }), 0);
  assert.equal(siteDiaryDurationHours({ ...legacyEntry, startedAt: "17:00", finishedAt: "16:00" }), 0);
});

test("saving a site diary creates a linked job timeline activity with operational detail", () => {
  const entry = { ...normaliseSiteDiaryEntry(legacyEntry), followUpActions: "Confirm second-fix date." };
  const timeline = siteDiaryTimelineEntry({ entry, timelineId: "timeline-diary-1", completedBy: "Jake", now: "2026-08-04T16:32:00.000Z" });
  assert.equal(timeline.eventType, "Site diary");
  assert.equal(timeline.sourceId, entry.id);
  assert.equal(timeline.jobId, "job-1");
  assert.match(timeline.note, /Completed first-fix socket wiring/);
  assert.match(timeline.note, /Confirm second-fix date/);
});

test("site diary collection keeps existing singular-key records while moving to the canonical cloud collection", async () => {
  const collections = await readFile(path.join(root, "lib/cloud/coreBusinessCollections.ts"), "utf8");
  assert.match(collections, /siteDiaries: "jr-os-site-diaries"/);
  assert.match(collections, /legacySiteDiaries: "jr-os-site-diary"/);
  assert.match(collections, /legacyItems\.filter/);
  assert.match(collections, /removeCanonical\(predicate\)/);
  assert.match(collections, /removeLegacy\(predicate\)/);
  assert.match(tenantListQuery({ organisationId: "org-a", collectionKey: "jr-os-site-diaries" }), /organisation_id=eq\.org-a/);
});

test("mobile diary workflow captures every required on-site field and writes job activity", async () => {
  const siteManagement = await readFile(path.join(root, "app/site-management/page.tsx"), "utf8");
  for (const label of ["Diary date", "Arrival time", "Finish time", "Staff present", "Work completed", "Delays", "Builder instructions", "Customer instructions", "Materials used", "Materials required", "Site photos", "Voice-note transcript", "Weather (where relevant)", "Issues and risks", "Follow-up actions"]) {
    assert.match(siteManagement, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(siteManagement, /useSiteDiariesCollection/);
  assert.match(siteManagement, /siteDiaryTimelineEntry/);
  assert.match(siteManagement, /photoDocumentIds/);
});

test("customer CRM timeline retains job-linked site diary entries newest first", async () => {
  const crm = await readFile(path.join(root, "lib/crmPro.ts"), "utf8");
  const customer = await readFile(path.join(root, "app/customers/[id]/page.tsx"), "utf8");
  assert.match(crm, /kind: "Site diary"/);
  assert.match(crm, /jobIds\.has\(entry\.jobId\)/);
  assert.match(customer, /diaries: diaries\.items/);
  assert.match(crm, /timeline\.toSorted\(\(left, right\) => right\.occurredAt\.localeCompare\(left\.occurredAt\)\)/);
});
