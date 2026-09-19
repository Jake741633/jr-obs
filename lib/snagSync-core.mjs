import { queueTargetSyncState } from "./cloud/repository-core.mjs";

export const awaitingQueueState = "AwaitingQueue";

const cloudCollectionsTable = "cloud_collections";
const taskCollectionKey = "jr-os-job-tasks";
const timelineCollectionKey = "jr-os-job-timeline";

export function emptySnagSyncProjection(scopeKey = "") {
  return {
    scopeKey,
    initialized: false,
    attempts: {},
    taskTargets: {},
    timelineTargets: {},
  };
}

function scopedProjection(current, scopeKey) {
  return current?.scopeKey === scopeKey ? current : emptySnagSyncProjection(scopeKey);
}

function attemptIsSynced(projection, taskId) {
  const attempt = projection.attempts[taskId];
  return Boolean(attempt
    && projection.taskTargets[taskId]?.state === "Synced"
    && projection.timelineTargets[attempt.timelineId]?.state === "Synced");
}

export function registerSnagSyncAttempt(current, { scopeKey, taskId, timelineId, jobId, title, action }) {
  const scoped = scopedProjection(current, scopeKey);
  const previousAttempt = scoped.attempts[taskId];
  if (previousAttempt && !attemptIsSynced(scoped, taskId)) return scoped;

  const timelineTargets = { ...scoped.timelineTargets };
  if (previousAttempt) delete timelineTargets[previousAttempt.timelineId];
  timelineTargets[timelineId] = {
    seen: false,
    state: awaitingQueueState,
    taskId,
  };

  return {
    ...scoped,
    attempts: {
      ...scoped.attempts,
      [taskId]: { timelineId, jobId, title, action },
    },
    taskTargets: {
      ...scoped.taskTargets,
      [taskId]: { seen: false, state: awaitingQueueState },
    },
    timelineTargets,
  };
}

function exactCollectionTarget(item, collectionKey, sourceId) {
  return item.table === cloudCollectionsTable
    && item.collectionKey === collectionKey
    && item.sourceId === sourceId;
}

function objectPayload(item) {
  const payload = item?.payload;
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : null;
}

function isRetainedSnagTask(item) {
  const payload = objectPayload(item);
  return Boolean(payload && String(payload.type ?? "").trim().toLowerCase() === "snag");
}

function retainedSnagTimelineTaskId(item) {
  const payload = objectPayload(item);
  if (!payload
    || String(payload.sourceType ?? "").trim().toLowerCase() !== "jobtask"
    || String(payload.eventType ?? "").trim().toLowerCase() !== "snag"
    || typeof payload.sourceId !== "string"
    || !payload.sourceId.trim()) return undefined;
  return payload.sourceId;
}

function refreshTargets({ queue, collectionKey, current, requiredIds, online, discover, metadata }) {
  const discoveredItems = queue.filter((item) => exactCollectionTarget(item, collectionKey, item.sourceId) && discover(item));
  const sourceIds = new Set([
    ...Object.keys(current),
    ...requiredIds,
    ...discoveredItems.map((item) => item.sourceId),
  ]);
  const next = {};

  for (const sourceId of sourceIds) {
    const previous = current[sourceId];
    const matching = queue.filter((item) => exactCollectionTarget(item, collectionKey, sourceId));
    if (matching.length) {
      next[sourceId] = {
        ...previous,
        ...metadata(matching[0]),
        seen: true,
        state: queueTargetSyncState(queue, {
          table: cloudCollectionsTable,
          collectionKey,
          sourceId,
        }, online),
      };
    } else if (previous?.seen) {
      next[sourceId] = { ...previous, seen: true, state: "Synced" };
    } else if (requiredIds.has(sourceId)) {
      next[sourceId] = { ...previous, seen: false, state: awaitingQueueState };
    }
  }

  return next;
}

export function refreshSnagSyncProjection({ current, scopeKey, queue, online }) {
  const scoped = scopedProjection(current, scopeKey);
  const taskIds = new Set(Object.keys(scoped.attempts));
  const timelineIds = new Set(Object.values(scoped.attempts).map((attempt) => attempt.timelineId));

  return {
    ...scoped,
    initialized: true,
    taskTargets: refreshTargets({
      queue,
      collectionKey: taskCollectionKey,
      current: scoped.taskTargets,
      requiredIds: taskIds,
      online,
      discover: isRetainedSnagTask,
      metadata: () => ({}),
    }),
    timelineTargets: refreshTargets({
      queue,
      collectionKey: timelineCollectionKey,
      current: scoped.timelineTargets,
      requiredIds: timelineIds,
      online,
      discover: (item) => Boolean(retainedSnagTimelineTaskId(item)),
      metadata: (item) => {
        const taskId = retainedSnagTimelineTaskId(item);
        return taskId ? { taskId } : {};
      },
    }),
  };
}

export function snagAttemptStates(projection, taskId) {
  const attempt = projection.attempts[taskId];
  if (!attempt) return null;
  return {
    task: projection.taskTargets[taskId]?.state ?? awaitingQueueState,
    timeline: projection.timelineTargets[attempt.timelineId]?.state ?? awaitingQueueState,
    ...attempt,
  };
}

export function snagTaskHasUnconfirmedSync(projection, taskId) {
  const attempt = snagAttemptStates(projection, taskId);
  if (attempt && (attempt.task !== "Synced" || attempt.timeline !== "Synced")) return true;
  if (projection.taskTargets[taskId]?.state && projection.taskTargets[taskId].state !== "Synced") return true;
  return Object.values(projection.timelineTargets).some((target) => target.taskId === taskId && target.state !== "Synced");
}

export function unpairedSnagTargetStates(projection) {
  const pairedTaskIds = new Set(Object.keys(projection.attempts));
  const pairedTimelineIds = new Set(Object.values(projection.attempts).map((attempt) => attempt.timelineId));
  return [
    ...Object.entries(projection.taskTargets)
      .filter(([sourceId, target]) => !pairedTaskIds.has(sourceId) && target.state !== "Synced")
      .map(([sourceId, target]) => ({ kind: "task", sourceId, state: target.state })),
    ...Object.entries(projection.timelineTargets)
      .filter(([sourceId, target]) => !pairedTimelineIds.has(sourceId) && target.state !== "Synced")
      .map(([sourceId, target]) => ({ kind: "timeline", sourceId, taskId: target.taskId, state: target.state })),
  ];
}
