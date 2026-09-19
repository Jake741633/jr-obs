import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  confirmSurveyBeforeNavigation,
  fieldSurveyCreationAllowed,
  persistSurveyBeforeNavigation,
  surveyCreateSyncMessage,
  surveyCreationRequiresCloudConfirmation,
} from "../lib/surveyCreation-core.mjs";

const surveysPage = readFileSync(new URL("../app/surveys/page.tsx", import.meta.url), "utf8");
const storage = readFileSync(new URL("../lib/storage.ts", import.meta.url), "utf8");
const accessGuard = readFileSync(new URL("../components/CloudAccessGuard.tsx", import.meta.url), "utf8");

function section(source, startText, endText) {
  const start = source.indexOf(startText);
  assert.ok(start >= 0, `Missing section start: ${startText}`);
  const end = source.indexOf(endText, start);
  assert.ok(end > start, `Missing section end: ${endText}`);
  return source.slice(start, end);
}

test("survey creation policy preserves local and office offline work but blocks field offline creation", () => {
  assert.equal(fieldSurveyCreationAllowed({ fieldMode: false, online: false }), true);
  assert.equal(fieldSurveyCreationAllowed({ fieldMode: true, online: true }), true);
  assert.equal(fieldSurveyCreationAllowed({ fieldMode: true, online: false }), false);

  assert.equal(surveyCreationRequiresCloudConfirmation({ mode: "local", online: true, authenticated: false }), false);
  assert.equal(surveyCreationRequiresCloudConfirmation({ mode: "local", online: false, authenticated: true }), false);
  assert.equal(surveyCreationRequiresCloudConfirmation({ mode: "migration", online: false, authenticated: true }), false);
  assert.equal(surveyCreationRequiresCloudConfirmation({ mode: "migration", online: true, authenticated: false }), false);
  assert.equal(surveyCreationRequiresCloudConfirmation({ mode: "migration", online: true, authenticated: true }), true);
  assert.equal(surveyCreationRequiresCloudConfirmation({ mode: "cloud", online: false, authenticated: true }), true);
  assert.equal(surveyCreationRequiresCloudConfirmation({ mode: "cloud", online: true, authenticated: true }), true);
});

test("local survey navigation occurs only after the synchronous persistence barrier", async () => {
  const calls = [];
  const state = await persistSurveyBeforeNavigation({
    persist: () => calls.push("persist"),
    requiresCloudConfirmation: false,
    flush: async () => calls.push("flush"),
    isCurrent: () => true,
    getSyncState: () => { calls.push("state"); return "Synced"; },
    navigate: () => calls.push("navigate"),
  });

  assert.equal(state, "Synced");
  assert.deepEqual(calls, ["persist", "navigate"]);
});

test("cloud survey navigation waits for flush and exact target confirmation", async () => {
  const calls = [];
  let releaseFlush;
  const flushGate = new Promise((resolve) => { releaseFlush = resolve; });
  const result = persistSurveyBeforeNavigation({
    persist: () => calls.push("persist"),
    requiresCloudConfirmation: true,
    flush: async () => { calls.push("flush-start"); await flushGate; calls.push("flush-end"); },
    isCurrent: () => true,
    getSyncState: () => { calls.push("state"); return "Synced"; },
    navigate: () => calls.push("navigate"),
  });

  await Promise.resolve();
  assert.deepEqual(calls, ["persist", "flush-start"]);
  releaseFlush();
  assert.equal(await result, "Synced");
  assert.deepEqual(calls, ["persist", "flush-start", "flush-end", "state", "navigate"]);
});

test("pending and terminal cloud states never navigate and remain retryable", async () => {
  for (const expectedState of ["Pending", "Offline", "Failed", "Conflict"]) {
    let navigated = false;
    const state = await persistSurveyBeforeNavigation({
      persist: () => {},
      requiresCloudConfirmation: true,
      flush: async () => {},
      isCurrent: () => true,
      getSyncState: () => expectedState,
      navigate: () => { navigated = true; },
    });
    assert.equal(state, expectedState);
    assert.equal(navigated, false);
    assert.match(surveyCreateSyncMessage(expectedState), /saved on this device/i);
  }
});

test("persistence and flush exceptions prevent navigation", async () => {
  const persistenceCalls = [];
  await assert.rejects(
    persistSurveyBeforeNavigation({
      persist: () => { persistenceCalls.push("persist"); throw new Error("storage unavailable"); },
      requiresCloudConfirmation: true,
      flush: async () => persistenceCalls.push("flush"),
      isCurrent: () => true,
      getSyncState: () => "Synced",
      navigate: () => persistenceCalls.push("navigate"),
    }),
    /storage unavailable/,
  );
  assert.deepEqual(persistenceCalls, ["persist"]);

  const flushCalls = [];
  await assert.rejects(
    confirmSurveyBeforeNavigation({
      flush: async () => { flushCalls.push("flush"); throw new Error("network unavailable"); },
      isCurrent: () => true,
      getSyncState: () => { flushCalls.push("state"); return "Synced"; },
      navigate: () => flushCalls.push("navigate"),
    }),
    /network unavailable/,
  );
  assert.deepEqual(flushCalls, ["flush"]);
});

test("authorization changes block persistence and post-flush navigation", async () => {
  const staleBeforePersist = [];
  assert.equal(await persistSurveyBeforeNavigation({
    persist: () => staleBeforePersist.push("persist"),
    requiresCloudConfirmation: true,
    flush: async () => staleBeforePersist.push("flush"),
    isCurrent: () => false,
    getSyncState: () => { staleBeforePersist.push("state"); return "Synced"; },
    navigate: () => staleBeforePersist.push("navigate"),
  }), "Failed");
  assert.deepEqual(staleBeforePersist, []);

  let current = true;
  const changedDuringFlush = [];
  assert.equal(await confirmSurveyBeforeNavigation({
    flush: async () => { changedDuringFlush.push("flush"); current = false; },
    isCurrent: () => current,
    getSyncState: () => { changedDuringFlush.push("state"); return "Synced"; },
    navigate: () => changedDuringFlush.push("navigate"),
  }), "Failed");
  assert.deepEqual(changedDuringFlush, ["flush"]);
});

test("collection create commits cache, creator sidecar and expected version zero before state", () => {
  const createItem = section(storage, "const createItem = useCallback", "\n\n  return { items:");
  assert.match(createItem, /if \(!isReady\) throw new Error/);
  assert.match(createItem, /if \(!id\) throw new Error/);
  assert.match(createItem, /current\.some\(\(record\) => recordId\(record\) === id\)/);
  assert.match(createItem, /repository\.save\([\s\S]*, 0\);/);
  assert.match(createItem, /setCreatedBySourceId\(repository\.recordCreators\(\)\)/);
  assert.match(createItem, /window\.localStorage\.setItem\(activeStorageKey, JSON\.stringify\(next\)\)/);
  const repositoryWrite = createItem.indexOf("repository.save");
  const localWrite = createItem.indexOf("window.localStorage.setItem");
  const stateWrite = createItem.indexOf("setItems(next)");
  assert.ok(repositoryWrite >= 0 && repositoryWrite < stateWrite);
  assert.ok(localWrite >= 0 && localWrite < stateWrite);
  assert.match(storage, /return \{ items: displayItems, setItems, createItem, remove, isReady, createdBySourceId \}/);
});

test("survey page persists, confirms the exact queue target, and uses client navigation", () => {
  const createSurvey = section(surveysPage, "async function createSurvey", "\n\n  const filtered");
  assert.match(createSurvey, /surveys\.createItem\(survey\)/);
  assert.doesNotMatch(createSurvey, /surveys\.setItems/);
  assert.match(createSurvey, /persistSurveyBeforeNavigation\(\{/);
  assert.match(createSurvey, /surveyCreationRequiresCloudConfirmation\(\{[\s\S]*mode: identityState\.mode,[\s\S]*online: navigator\.onLine,[\s\S]*authenticated: Boolean\(expectedAuthorization\)/);
  assert.match(surveysPage, /queueTargetSyncState\(getSyncQueue\(\), \{\s*table: "cloud_collections",\s*collectionKey: "jr-os-surveys",\s*sourceId: surveyId/s);
  assert.match(createSurvey, /flush: flushSyncQueue/);
  assert.match(createSurvey, /isCurrent: \(\) => operationIsCurrent\(expectedAuthorization, operationGeneration\)/);
  assert.match(createSurvey, /router\.push\(`\/surveys\/\$\{survey\.id\}`\)/);
  assert.doesNotMatch(surveysPage, /window\.location/);
});

test("survey creation state and async completion stay bound to the full live identity", () => {
  assert.match(accessGuard, /const workspaceIdentityKey = JSON\.stringify\(\[[\s\S]*identity\.organisationId,[\s\S]*identity\.userId,[\s\S]*identity\.role,[\s\S]*identity\.customerSourceId \?\? ""/);
  assert.match(accessGuard, /<Fragment key=\{workspaceIdentityKey\}>\{children\}<\/Fragment>/);
  assert.match(surveysPage, /activeSyncAuthorizationMatches\(expectedAuthorization\)/);
  assert.match(surveysPage, /const mountedRef = useRef\(true\)/);
  assert.match(surveysPage, /operationGenerationRef\.current \+= 1/);
  assert.match(surveysPage, /return \(\) => \{\s*mountedRef\.current = false;\s*operationGenerationRef\.current \+= 1;\s*creatingRef\.current = false/);
  assert.match(surveysPage, /if \(!mountedRef\.current \|\| operationGenerationRef\.current !== operationGeneration\) return false/);
  assert.match(surveysPage, /if \(!operationIsCurrent\(expectedAuthorization, operationGeneration\)\) return;/);
  assert.match(surveysPage, /finally \{\s*finishCreationOperation\(operationGeneration\);\s*\}/);
  assert.match(surveysPage, /identityState\.mode === "cloud" && !identityState\.identity/);
  assert.match(surveysPage, /identityState\.mode === "migration" && !expectedAuthorization/);
});

test("field offline and unconfirmed surveys cannot enter the stale detail route", () => {
  assert.match(surveysPage, /const fieldMode = identityState\.mode !== "local" && identityState\.identity\?\.role === "electrician"/);
  assert.match(surveysPage, /!fieldSurveyCreationAllowed\(\{ fieldMode, online: navigator\.onLine \}\)/);
  assert.match(surveysPage, /Connect to the internet before creating a field survey\. Assigned survey details are not retained offline\./);
  assert.match(surveysPage, /const awaitingCloudConfirmation = survey\.id === unconfirmedSurveyId/);
  assert.match(surveysPage, /awaitingCloudConfirmation \? <span[^>]*>Waiting for cloud confirmation<\/span> : <>/);
  assert.match(surveysPage, /Retry cloud confirmation/);
});
