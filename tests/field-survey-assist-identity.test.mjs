import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/surveys/[id]/assist/page.tsx", import.meta.url), "utf8");

function section(source, startText, endText) {
  const start = source.indexOf(startText);
  assert.ok(start >= 0, `Missing section start: ${startText}`);
  const end = source.indexOf(endText, start);
  assert.ok(end > start, `Missing section end: ${endText}`);
  return source.slice(start, end);
}

test("survey assist resets sensitive transients across the full identity scope and fails closed until ready", () => {
  assert.match(page, /import \{ ChangeEvent, useEffect, useMemo, useRef, useState \} from "react";/);
  assert.match(page, /const surveyAssistIdentityScopeKey = JSON\.stringify\(\[\s*identityState\.identity\?\.organisationId \?\? null,\s*identityState\.identity\?\.userId \?\? null,\s*identityState\.identity\?\.role \?\? null,\s*identityState\.identity\?\.customerSourceId \?\? null,\s*\]\);/);

  const resetEffect = section(page, "useEffect(() => {", "\n\n  const interactionScopeReady");
  assert.match(resetEffect, /queueMicrotask\(\(\) => \{/);
  assert.match(resetEffect, /setTranscript\(""\);/);
  assert.match(resetEffect, /setSaved\(""\);/);
  assert.match(resetEffect, /setInteractionScopeKey\(surveyAssistIdentityScopeKey\);/);
  assert.match(resetEffect, /return \(\) => \{ active = false; \};/);
  assert.match(page, /const interactionScopeReady = interactionScopeKey === surveyAssistIdentityScopeKey;/);
  assert.match(page, /!surveys\.isReady \|\| !identityState\.isReady \|\| !interactionScopeReady/);
});

test("survey assist revalidates the current survey before applying transcript sugestions", () => {
  const handler = section(page, "function applySuggestions", "\n\n  function addBoardPhoto");
  const scopeGuard = handler.indexOf("if (!interactionScopeReady) return;");
  const surveyLookup = handler.indexOf("const currentSurvey = surveys.items.find((item) => item.id === id);");
  const missingGuard = handler.indexOf("if (!currentSurvey) return;");
  const mutation = handler.indexOf("update({");
  assert.ok(scopeGuard >= 0 && scopeGuard < surveyLookup, "the current identity scope must be ready before survey lookup");
  assert.ok(surveyLookup < missingGuard && missingGuard < mutation, "the current survey must be revalidated before suggestions mutate it");
  assert.match(handler, /voiceNotes: \[currentSurvey\.voiceNotes, transcript\]/);
  assert.match(handler, /defects: Array\.from\(new Set\(\[\.\.\.currentSurvey\.defects/);
});

test("asynchronous survey photos remain bound to the initiating identity and current survey", () => {
  const handler = section(page, "function addBoardPhoto", "\n\n  return <div");
  const requestedScope = handler.indexOf("const requestedScopeKey = surveyAssistIdentityScopeKey;");
  const reader = handler.indexOf("const reader = new FileReader();");
  const onload = handler.slice(handler.indexOf("reader.onload"));
  assert.ok(requestedScope >= 0 && requestedScope < reader, "the initiating identity scope must be captured before FileReader starts");
  assert.match(onload, /activeIdentityScopeKeyRef\.current !== requestedScopeKey/);
  assert.match(onload, /!surveyItemsRef\.current\.some\((item\) => item\.id === id\)/);
  assert.match(onload, /update\(\(currentSurvey\) => \(\{ photos: \[\.\.\.currentSurvey\.photos, photo\] \}\), requestedScopeKey\);/);
  const scopeGuard = onload.indexOf("activeIdentityScopeKeyRef.current !== requestedScopeKey");
  const mutation = onload.indexOf("update((currentSurvey)");
  const feedback = onload.indexOf('setSaved("Board photo added.');
  assert.ok(scopeGuard >= 0 && scopeGuard < mutation && mutation < feedback, "scope and record revalidation must precede photo mutation and feedback");
});
