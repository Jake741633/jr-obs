import type {
  JobPriority,
  JobTask,
  JobTaskStatus,
  JobTaskType,
  JobTimelineEntry,
} from "./models";

export const jobTaskStatuses: JobTaskStatus[];
export const jobTaskTypes: JobTaskType[];

export function isJobTaskStatus(status: unknown): status is JobTaskStatus;
export function normaliseJobTaskStatus(status: unknown): JobTaskStatus;
export function isOutstandingJobTask(task: JobTask): boolean;

export function transitionJobTask(input: {
  task: JobTask;
  nextStatus: JobTaskStatus;
  now: string;
}): JobTask;

export function jobTaskTimelineEntry(input: {
  task: JobTask;
  fromStatus: JobTaskStatus;
  toStatus: JobTaskStatus;
  timelineId: string;
  completedBy?: string;
  now: string;
}): JobTimelineEntry;

export function jobTaskCounts(tasks: JobTask[], jobId: string): {
  total: number;
  outstanding: number;
  outstandingTasks: number;
  outstandingSnags: number;
  completed: number;
};

export function sortJobTasks(tasks: JobTask[]): JobTask[];

export interface JobTaskSortRanks {
  priorityRank: Record<JobPriority, number>;
  statusRank: Record<JobTaskStatus, number>;
}
