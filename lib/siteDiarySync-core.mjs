import { queueTargetSyncState } from "./cloud/repository-core.mjs";

export const awaitingQueueState = "AwaitingQueue";

const cloudCollectionsTable = "cloud_collections";
const siteDiaryCollectionKey = "jr-os-site-diaries";
const timelineCollectionKey = "jr-os-job-timeline";

export function emptySiteDiarySyncProjection(scopeKey = "") {
  return {
    scopeKey,
    initialized: false,
    attempts: {},
    diaryTargets: {},
    timelineTargets: {},
  };
}

function scopedProjection(current, scopeKey) {
  return current?.scopeKey === scopeKey ? current : emptySiteDiarySyncProjection(scopeKey);
}

export function registerSiteDiarySyncAttempt(current, { scopeKey, diaryId, timelineId, jobId, workDate }) {
  const scoped = scopedProjection(current, scopeKey);
  if (scoped.attempts[diaryId]) return scoped;
  return {
    ...scoped,
    attempts: {
      ...scoped.attempts,
      [diaryId]: { timelineId, jobId, workDate },
    },
    diaryTargets: {
      ...scoped.diaryTargets,
      [diaryId]: scoped.diaryTargets[diaryId] ?? { seen: false, state: awaitingQueueState },
    },
    timelineTargets: {
      ...scoped.timelineTargets,
      [timelineId]: scoped.timelineTargets[timelineId] ?? { seen: false, state: awaitingQueueState },
    },
  };
}

function exactCollectionTarget(item, collectionKey, sourceId) {
  return item.table === cloudCollectionsTable
    && item.collectionKey === collectionKey
    && item.sourceId === sourceId;
}

function isRetainedSiteDiaryTimeline(item) {
  if (item.table !== cloudCollectionsTable || item.collectionKey !== timelineCollectionKey) return false;
  const payload = item.payload;
  return Boolean(payload && typeof payload === "object" && !Array.isArray(payload)
    && (payload.sourceType === "SiteDiaryEntry" || payload.eventType === "Site diary"));
}

function refreshTargets({ queue, collectionKey, current, requiredIds, online, discover }) {
  const sourceIds = new Set([
    ...Object.keys(current),
    ...requiredIds,
    ...queue
      .filter((item) => exactCollectionTarget(item, collectionKey, item.sourceId) && discover(item))
      .map((item) => item.sourceId),
  ]);
  const next = {};
  for (const sourceId of sourceIds) {
    const previous = current[sourceId];
    if (queue.some((item) => exactCollectionTarget(item, collectionKey, sourceId))) {
      next[sourceId] = {
        seen: true,
        state: queueTargetSyncState(queue, {
          table: cloudCollectionsTable,
          collectionKey,
          sourceId,
        }, online),
      };
    } else if (previous?.seen) {
      next[sourceId] = { seen: true, state: "Synced" };
    } else if (requiredIds.has(sourceId)) {
      next[sourceId] = { seen: false, state: awaitingQueueState };
    }
  }
  return next;
}

export function refreshSiteDiarySyncProjection({ current, scopeKey, queue, online }) {
  const scoped = scopedProjection(current, scopeKey);
  const diaryIds = new Set(Object.keys(scoped.attempts));
  const timelineIds = new Set(Object.values(scoped.attempts).map((attempt) => attempt.timelineId));
  return {
    ...scoped,
    initialized: true,
    diaryTargets: refreshTargets({
      queue,
      collectionKey: siteDiaryCollectionKey,
      current: scoped.diaryTargets,
      requiredIds: diaryIds,
      online,
      discover: () => true,
    }),
    timelineTargets: refreshTargets({
      queue,
      collectionKey: timelineCollectionKey,
      current: scoped.timelineTargets,
      requiredIds: timelineIds,
      online,
      discover: (item) => timelineIds.has(item.sourceId) || isRetainedSiteDiaryTimeline(item),
    }),
  };
}

export function siteDiaryAttemptStates(projection, diaryId) {
  const attempt = projection.attempts[diaryId];
  if (!attempt) return null;
  return {
    diary: projection.diaryTargets[diaryId]?.state ?? awaitingQueueState,
    timeline: projection.timelineTargets[attempt.timelineId]?.state ?? awaitingQueueState,
    ...attempt,
  };
}

export function unpairedSiteDiaryTargetStates(projection) {
  const pairedDiaryIds = new Set(Object.keys(projection.attempts));
  const pairedTimelineIds = new Set(Object.values(projection.attempts).map((attempt) => attempt.timelineId));
  return [
    ...Object.entries(projection.diaryTargets)
      .filter(([sourceId, target]) => !pairedDiaryIds.has(sourceId) && target.state !== "Synced")
      .map(([sourceId, target]) => ({ kind: "diary", sourceId, state: target.state })),
    ...Object.entries(projection.timelineTargets)
      .filter(([sourceId, target]) => !pairedTimelineIds.has(sourceId) && target.state !== "Synced")
      .map(([sourceId, target]) => ({ kind: "timeline", sourceId, state: target.state })),
  ];
}
