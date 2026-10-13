import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const home = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const assistant = await readFile(new URL("../components/ai/TodaysAssistant.tsx", import.meta.url), "utf8");
const renderedAssistant = assistant.replaceAll("&apos;", "'");
const intelligence = await readFile(new URL("../lib/dashboardIntelligence.ts", import.meta.url), "utf8");
const aiPage = await readFile(new URL("../app/ai/page.tsx", import.meta.url), "utf8");

test("main dashboard continues Today's Assistant on cloud-aware records", () => {
  assert.match(home, /<TodaysAssistant/);
  assert.match(home, /buildTodayAssistant/);
  assert.match(home, /buildSmartRecommendations/);
  for (const hook of ["useJobsCollection", "useCustomersCollection", "usePricingDocumentsCollection", "useInvoicesCollection", "usePlannerCollection", "useAiRemindersCollection", "useCertificatesCollection", "usePurchaseListsCollection"]) assert.match(home, new RegExp(`${hook}\\(\\)`));
});

test("dashboard shows every requested daily operating signal", () => {
  for (const label of ["Today's jobs", "Today's surveys", "Urgent invoices", "Quotes to follow up", "Materials to order", "Certificates outstanding", "Today's planner", "Urgent actions", "Business health score"]) assert.match(renderedAssistant, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(home, /businessHealthScore: operational\.health\.score/);
});

test("health, procurement and certificate signals use shared deterministic intelligence", () => {
  assert.match(intelligence, /export function outstandingCertificateJobs/);
  assert.match(intelligence, /new Set\(\["Complete", "Issued", "Archived"\]\)/);
  assert.match(intelligence, /export function materialOrderLists/);
  assert.match(intelligence, /item\.status === "Needed"/);
  assert.match(intelligence, /export function operationalHealthScore/);
  assert.match(intelligence, /Math\.max\(0, Math\.min\(100/);
});

test("home and AI Command Centre share the extended operating snapshot", () => {
  for (const source of [home, aiPage]) {
    assert.match(source, /todaysSurveys:/);
    assert.match(source, /materialsToOrder:/);
    assert.match(source, /certificatesOutstanding:/);
    assert.match(source, /businessHealthLabel:/);
  }
});
