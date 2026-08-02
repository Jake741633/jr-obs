import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const portal = readFileSync(new URL("../app/customer-portal/page.tsx", import.meta.url), "utf8");
const quotes = readFileSync(new URL("../app/quotes/page.tsx", import.meta.url), "utf8");
const storage = readFileSync(new URL("../lib/storage.ts", import.meta.url), "utf8");
const repository = readFileSync(new URL("../lib/cloud/repository.ts", import.meta.url), "utf8");

test("customer portal audit activity stays on tenant-scoped collections", () => {
  assert.match(portal, /useLocalStorageCollection<PortalActivity>\("jr-os-portal-activity"\)/);
  assert.match(portal, /useLocalStorageCollection<JobTimelineEntry>\("jr-os-job-timeline"\)/);
  assert.match(portal, /customerId: activeCustomerId/);
  assert.match(portal, /jobIds\.has\(entry\.jobId\)/);
  assert.doesNotMatch(portal, /localStorage\.(?:getItem|setItem)/);
});

test("pricing workflow audit entries use the shared scoped timeline store", () => {
  assert.match(quotes, /useCloudLocalCollection<JobTimelineEntry>\("jr-os-job-timeline"\)/);
  assert.match(quotes, /const timeline =/);
  assert.doesNotMatch(quotes, /localStorage\.(?:getItem|setItem)/);
});

test("audit collections inherit organisation and account cache scope", () => {
  assert.match(storage, /const activeStorageKey = organisationId \? accountStorageKey\(key, organisationId, cacheUserId\) : key/);
  assert.match(storage, /createCollectionRepository<RepositoryRecord>\(\{[\s\S]*organisationId,[\s\S]*userId,[\s\S]*cacheUserId,/);
  assert.match(repository, /organisation_id=eq\.\$\{encodeURIComponent\(organisationId\)\}/);
  assert.match(repository, /item\.organisationId === organisationId/);
});

test("audit sync queue operations remain bound to the originating organisation", () => {
  assert.match(repository, /organisationId: item\.organisationId/);
  assert.match(repository, /entry\.id === itemId && entry\.organisationId === organisationId/);
  assert.match(repository, /const preserved = allQueue\.filter\(\(item\) => item\.organisationId !== organisationId\)/);
});
