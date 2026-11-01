import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildMobileJobReadiness, mobileJobPriority, mobileJobView } from "../lib/mobileJobControl-core.mjs";

test("mobile readiness reports blockers and a percentage", () => {
  const result = buildMobileJobReadiness({
    hasSchedule: true,
    hasContact: true,
    hasMaterials: false,
    hasTesting: true,
    jobHref: "/jobs/job-1",
  });
  assert.equal(result.readyCount, 3);
  assert.equal(result.totalCount, 4);
  assert.equal(result.percentage, 75);
  assert.deepEqual(result.blockers.map((item) => item.id), ["materials"]);
  assert.equal(result.checks.find((item) => item.id === "contact").href, "/jobs/job-1");
});

test("today and on-site jobs sort before future work", () => {
  assert.equal(mobileJobPriority({ startDate: "2026-08-02", status: "Scheduled" }, "2026-08-02"), 0);
  assert.equal(mobileJobPriority({ startDate: "", status: "First fix" }, "2026-08-02"), 1);
  assert.equal(mobileJobPriority({ startDate: "2026-08-09", status: "Scheduled" }, "2026-08-02"), 2);
});

test("mobile job views separate working-day, attention and future work", () => {
  const date = "2026-08-02";
  assert.equal(mobileJobView({ startDate: date, status: "Scheduled" }, date), "today");
  assert.equal(mobileJobView({ startDate: "", status: "First fix" }, date), "today");
  assert.equal(mobileJobView({ startDate: "2026-08-09", status: "Scheduled" }, date), "upcoming");
  assert.equal(mobileJobView({ startDate: "2026-08-01", status: "Scheduled" }, date), "attention");
  assert.equal(mobileJobView({ startDate: "", status: "Scheduled" }, date), "attention");
});

test("mobile job control route and navigation exist", () => {
  const page = readFileSync(new URL("../app/field/jobs/page.tsx", import.meta.url), "utf8");
  const navigation = readFileSync(new URL("../components/navigation.ts", import.meta.url), "utf8");
  assert.match(page, /title="Job control"/);
  assert.match(page, /buildMobileJobReadiness/);
  assert.match(page, /Navigate/);
  assert.match(page, /type="button"|href="\/field"/);
  assert.match(navigation, /\["Mobile Job Control", "\/field\/jobs"\]/);
});

test("mobile job control keeps the permission-filtered job collection but focuses the visible working set", () => {
  const page = readFileSync(new URL("../app/field/jobs/page.tsx", import.meta.url), "utf8");
  assert.match(page, /const summaries = work\.map/);
  assert.match(page, /aria-label="Choose active job view"/);
  assert.match(page, /aria-pressed=\{selectedView === view\.id\}/);
  assert.match(page, /Today & on site/);
  assert.match(page, /Needs attention/);
  assert.match(page, /Upcoming visits/);
  assert.match(page, /visibleSummaries/);
  assert.match(page, /min-h-12/);
});

test("field readiness links provide 48px touch targets", () => {
  const page = readFileSync(new URL("../app/field/jobs/page.tsx", import.meta.url), "utf8");
  const readinessLinks = page.match(/readiness\.checks\.map\(\(check\) => <Link[\s\S]*?<\/Link>\)\}/)?.[0];
  assert.ok(readinessLinks, "field readiness links should remain rendered");
  assert.match(readinessLinks, /min-h-12/);
  assert.doesNotMatch(readinessLinks, /min-h-11/);
});
