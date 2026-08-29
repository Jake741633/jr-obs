import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  creatorMapForCloudRows,
  normaliseRecordCreatorMap,
  retainRecordCreatorsForRecords,
} from "../lib/cloud/recordCreatorMetadata-core.mjs";

const adapter = readFileSync(new URL("../lib/cloud/adapter.ts", import.meta.url), "utf8");
const repository = readFileSync(new URL("../lib/cloud/repository.ts", import.meta.url), "utf8");
const storage = readFileSync(new URL("../lib/storage.ts", import.meta.url), "utf8");

test("creator metadata normalises malformed browser state fail closed", () => {
  for (const malformed of [null, undefined, [], 7, "creator", { survey: 9 }, { survey: "   " }]) {
    assert.deepEqual(normaliseRecordCreatorMap(malformed), {});
  }
  assert.deepEqual(
    normaliseRecordCreatorMap({ "survey-1": "  user-1  ", "survey-2": null, "": "user-2" }),
    { "survey-1": "user-1" },
  );
});

test("creator metadata accepts only visible envelopes with matching payload identity", () => {
  const rows = [
    { source_id: "survey-1", created_by: "user-1", payload: { id: "survey-1" } },
    { source_id: "survey-2", created_by: "user-2", payload: { id: "other-survey" } },
    { source_id: "survey-3", created_by: "user-3", payload: { id: "survey-3" } },
    { source_id: "survey-4", created_by: null, payload: { id: "survey-4" } },
  ];

  assert.deepEqual(creatorMapForCloudRows(rows, [{ id: "survey-1" }, { id: "survey-2" }, { id: "survey-4" }]), {
    "survey-1": "user-1",
  });
  assert.deepEqual(retainRecordCreatorsForRecords({ "survey-1": "user-1", "survey-3": "user-3" }, [{ id: "survey-1" }]), {
    "survey-1": "user-1",
  });
});

test("collection creator sidecar stays account scoped and outside record payloads", () => {
  assert.match(repository, /created_by\?: string \| null/);
  assert.match(adapter, /recordCreatorStorageKey\(storageKey: string\).*jr-os-cloud-created-by:\$\{storageKey\}/);
  assert.match(adapter, /const scopedStorageKey = accountStorageKey\(storageKey, organisationId, cacheUserId, cacheRole, cacheCustomerSourceId\)/);
  assert.match(adapter, /let currentRecordCreators = readRecordCreators\(scopedStorageKey\)/);
  assert.match(adapter, /recordCreators\(\) \{ return \{ \.\.\.currentRecordCreators \}; \}/);
  assert.match(adapter, /cachePolicy === "purge" \? \{\} : retainRecordCreatorsForRecords\(currentRecordCreators, local\)/);
  assert.match(adapter, /replaceRecordCreators\(creatorMapForCloudRows\(rows, roleProjectionRecords\)\)/);
  assert.match(adapter, /if \(expectedVersion === 0 && userId\)[\s\S]*\[record\.id\]: userId/);
  assert.match(adapter, /delete creators\[sourceId\];[\s\S]*replaceRecordCreators\(creators\)/);
  assert.match(adapter, /function writeRecordCreators[\s\S]*try \{ window\.localStorage\.setItem[\s\S]*\} catch \{/);
  assert.match(adapter, /queueChange\(\{[^}]*payload: record[^}]*\}\)/);
  assert.doesNotMatch(adapter, /payload:\s*\{[^}]*created_by/);
});

test("collection hook exposes creator metadata without merging it into items", () => {
  assert.match(storage, /const \[createdBySourceId, setCreatedBySourceId\] = useState<RecordCreatorMap>\(\{\}\)/);
  assert.match(storage, /loadedCreators = repository\.recordCreators\(\)/);
  assert.match(storage, /setCreatedBySourceId\(repository\.recordCreators\(\)\)/);
  assert.match(storage, /return \{ items: displayItems, setItems, createItem, remove, isReady, createdBySourceId \}/);
  assert.doesNotMatch(storage, /\.\.\.item,\s*createdBy/);
});
