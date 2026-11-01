import { dayPlannerSummary } from "./engineerDayPlanner-core.mjs";
import { queueTargetSyncState } from "./cloud/repository-core.mjs";

export const awaitingQueueState = "AwaitingQueue";

export function emptyLabourSyncProjection(scopeKey = "") {
  return {
    scopeKey,
    initialized: false,
    attempts: {},
    plannerTargets: {},
    timesheetTargets: {},
  };
}

function scopedProjection(current, scopeKey) {
  return current?.scopeKey === scopeKey ? current : emptyLabourSyncProjection(scopeKey);
}

export function registerLabourSyncAttempt(current, { scopeKey, entryId, timesheetId }) {
  const scoped = scopedProjection(current, scopeKey);
  if (scoped.attempts[entryId]) return scoped;
  return {
    ...scoped,
    attempts: {
      ...scoped.attempts,
      [entryId]: { timesheetId },
    },
    plannerTargets: {
      ...scoped.plannerTargets,
      [entryId]: scoped.plannerTargets[entryId] ?? { seen: false, state: awaitingQueueState },
    },
    timesheetTargets: {
      ...scoped.timesheetTargets,
      [timesheetId]: scoped.timesheetTargets[timesheetId] ?? { seen: false, state: awaitingQueueState },
    },
  };
}

function exactTypedTarget(item, table, sourceId) {
  return item.table === table
    && item.sourceId === sourceId
    && (item.collectionKey ?? undefined) === undefined;
}

function refreshTargets({ queue, table, current, requiredIds, online }) {
  const sourceIds = new Set([
    ...Object.keys(current),
    ...requiredIds,
    ...queue
      .filter((item) => item.table === table && (item.collectionKey ?? undefined) === undefined)
      .map((item) => item.sourceId),
  ]);
  const next = {};
  for (const sourceId of sourceIds) {
    const previous = current[sourceId];
    if (queue.some((item) => exactTypedTarget(item, table, sourceId))) {
      next[sourceId] = {
        seen: true,
        state: queueTargetSyncState(queue, { table, sourceId }, online),
      };
    } else if (previous?.seen) {
      next[sourceId] = { seen: true, state: "Synced" };
    } else if (requiredIds.has(sourceId)) {
      next[sourceId] = { seen: false, state: awaitingQueueState };
    }
  }
  return next;
}

export function refreshLabourSyncProjection({ current, scopeKey, queue, online }) {
  const scoped = scopedProjection(current, scopeKey);
  const plannerIds = new Set(Object.keys(scoped.attempts));
  const timesheetIds = new Set(Object.values(scoped.attempts).map((attempt) => attempt.timesheetId));
  return {
    ...scoped,
    initialized: true,
    plannerTargets: refreshTargets({
      queue,
      table: "planner_entries",
      current: scoped.plannerTargets,
      requiredIds: plannerIds,
      online,
    }),
    timesheetTargets: refreshTargets({
      queue,
      table: "timesheets",
      current: scoped.timesheetTargets,
      requiredIds: timesheetIds,
      online,
    }),
  };
}

export function labourAttemptStates(projection, entryId) {
  const attempt = projection.attempts[entryId];
  if (!attempt) return null;
  return {
    planner: projection.plannerTargets[entryId]?.state ?? awaitingQueueState,
    timesheet: projection.timesheetTargets[attempt.timesheetId]?.state ?? awaitingQueueState,
    timesheetId: attempt.timesheetId,
  };
}

export function unpairedLabourTargetStates(projection) {
  const pairedTimesheetIds = new Set(Object.values(projection.attempts).map((attempt) => attempt.timesheetId));
  return Object.entries(projection.timesheetTargets)
    .filter(([sourceId, target]) => !pairedTimesheetIds.has(sourceId) && target.state !== "Synced")
    .map(([sourceId, target]) => ({ sourceId, state: target.state }));
}

export function confirmedDayPlannerSummary(entries, timesheets, date, projection) {
  const unconfirmedPlannerIds = new Set(Object.entries(projection.plannerTargets)
    .filter(([, target]) => target.state !== "Synced")
    .map(([sourceId]) => sourceId));
  const unconfirmedTimesheetIds = new Set(Object.entries(projection.timesheetTargets)
    .filter(([, target]) => target.state !== "Synced")
    .map(([sourceId]) => sourceId));
  const unconfirmedPlannerJobIds = new Set(entries
    .filter((entry) => unconfirmedPlannerIds.has(entry.id) && entry.jobId)
    .map((entry) => entry.jobId));
  const confirmedEntries = entries.map((entry) => unconfirmedPlannerIds.has(entry.id) && entry.status === "Complete"
    ? { ...entry, status: "Confirmed" }
    : entry);
  const confirmedTimesheets = timesheets
    .filter((entry) => !unconfirmedTimesheetIds.has(entry.id))
    .map((entry) => entry.jobId && unconfirmedPlannerJobIds.has(entry.jobId)
      ? { ...entry, jobId: undefined }
      : entry);
  return dayPlannerSummary(confirmedEntries, confirmedTimesheets, date);
}
