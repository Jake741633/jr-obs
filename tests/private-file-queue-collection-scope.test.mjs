import assert from "node:assert/strict";
import test from "node:test";
import {
  partitionPrivateUploadQueue,
  privateUploadMatchesAuthorization,
} from "../lib/cloud/privateUploadQueue-core.mjs";

const authorization = {
  organisationId: "org-a",
  userId: "user-a",
  role: "admin",
  customerSourceId: undefined,
};

function queueItem(id, storageKey, overrides = {}) {
  return {
    id,
    organisationId: authorization.organisationId,
    userId: authorization.userId,
    authorizationRole: authorization.role,
    authorizationCustomerSourceId: authorization.customerSourceId,
    storageKey,
    ...overrides,
  };
}

test("collection-scoped replay preserves other same-authorization private uploads", () => {
  const queue = [
    queueItem("job-document", "jr-os-job-documents"),
    queueItem("survey-photo", "jr-os-surveys"),
    queueItem("expense-receipt", "jr-os-expenses"),
    queueItem("other-user-document", "jr-os-job-documents", { userId: "user-b" }),
  ];
  const before = structuredClone(queue);

  const result = partitionPrivateUploadQueue(queue, authorization, "jr-os-job-documents");

  assert.deepEqual(result.activeQueue.map((item) => item.id), ["job-document"]);
  assert.deepEqual(result.preserved.map((item) => item.id), [
    "survey-photo",
    "expense-receipt",
    "other-user-document",
  ]);
  assert.deepEqual(queue, before);
});

test("each mounted private-file bridge replays only its exact collection", () => {
  const queue = [
    queueItem("job-document", "jr-os-job-documents"),
    queueItem("survey-photo", "jr-os-surveys"),
    queueItem("expense-receipt", "jr-os-expenses"),
  ];

  for (const item of queue) {
    const result = partitionPrivateUploadQueue(queue, authorization, item.storageKey);
    assert.deepEqual(result.activeQueue.map((entry) => entry.id), [item.id]);
    assert.equal(result.preserved.length, 2);
  }
});

test("private upload collection scope retains the full authorization tuple", () => {
  const customerAuthorization = { ...authorization, role: "customer", customerSourceId: "customer-a" };
  const exact = queueItem("exact", "jr-os-surveys", {
    authorizationRole: "customer",
    authorizationCustomerSourceId: "customer-a",
  });

  assert.equal(privateUploadMatchesAuthorization(exact, customerAuthorization), true);
  assert.equal(privateUploadMatchesAuthorization({ ...exact, organisationId: "org-b" }, customerAuthorization), false);
  assert.equal(privateUploadMatchesAuthorization({ ...exact, userId: "user-b" }, customerAuthorization), false);
  assert.equal(privateUploadMatchesAuthorization({ ...exact, authorizationRole: "admin" }, customerAuthorization), false);
  assert.equal(privateUploadMatchesAuthorization({ ...exact, authorizationCustomerSourceId: "customer-b" }, customerAuthorization), false);
});
