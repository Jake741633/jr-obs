const DIRECT_ELECTRICIAN_TABLES = new Set([
  "planner_entries",
  "timesheets",
]);

const FIELD_COLLECTION_INTENTS = Object.freeze({
  "jr-os-surveys": ["create", "update"],
  "jr-os-site-diaries": ["create"],
  "jr-os-job-tasks": ["create", "update"],
  "jr-os-job-timeline": ["create"],
});

const DEDICATED_FIELD_COLLECTION_ROUTES = Object.freeze({
  "jr-os-job-progress": {
    functionName: "jr_field_save_job_progress",
    allowedIntents: ["create", "update"],
  },
});

export function collectionCloudMutationRoute(table, role, collectionKey) {
  if (role !== "electrician") return { kind: "direct" };
  if (DIRECT_ELECTRICIAN_TABLES.has(table)) return { kind: "direct" };

  if (table === "jobs") {
    return {
      kind: "rpc",
      functionName: "jr_field_update_job_status",
      resource: "jobs",
      allowedIntents: ["update"],
    };
  }

  const dedicatedRoute = table === "cloud_collections" && collectionKey
    ? DEDICATED_FIELD_COLLECTION_ROUTES[collectionKey]
    : undefined;
  if (dedicatedRoute) {
    return {
      kind: "rpc",
      functionName: dedicatedRoute.functionName,
      resource: "cloud_collections",
      allowedIntents: dedicatedRoute.allowedIntents,
    };
  }

  const allowedIntents = table === "cloud_collections" && collectionKey
    ? FIELD_COLLECTION_INTENTS[collectionKey]
    : undefined;
  if (allowedIntents) {
    return {
      kind: "rpc",
      functionName: "jr_field_save_collection",
      resource: "cloud_collections",
      allowedIntents,
    };
  }

  // Electrician mutation access is deliberately default-deny. In particular,
  // canonical reads must never imply writes for certificates, testing,
  // documents, stock movements or any newly registered browser collection.
  return { kind: "deny" };
}

export function fieldMutationRouteAllows(route, operation, baseIntent) {
  return route?.kind === "rpc"
    && operation === "upsert"
    && (baseIntent === "create" || baseIntent === "update")
    && route.allowedIntents.includes(baseIntent);
}

export function normaliseFieldRequestedJobStatus(status) {
  return status === "In progress" ? "First fix" : status;
}

export function isServerAuthoredFieldTimeline(table, role, collectionKey, payload) {
  if (role !== "electrician" || table !== "cloud_collections"
    || collectionKey !== "jr-os-job-timeline" || !payload
    || typeof payload !== "object" || Array.isArray(payload)) return false;
  const eventType = String(payload.eventType ?? "").trim().toLowerCase();
  const sourceType = String(payload.sourceType ?? "").trim().toLowerCase();
  return eventType === "status change"
    || (sourceType === "job" && (payload.fromStatus !== undefined || payload.toStatus !== undefined));
}
