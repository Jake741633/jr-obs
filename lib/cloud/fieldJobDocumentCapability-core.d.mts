export interface LiveFieldJobDocumentTarget {
  organisationId: string;
  jobId: string;
  sourceId: string;
}

export interface LiveFieldJobDocumentEnvelope {
  organisation_id?: unknown;
  source_id?: unknown;
  job_source_id?: unknown;
  payload?: unknown;
  deleted_at?: unknown;
}

export function liveFieldJobDocumentQuery(target: LiveFieldJobDocumentTarget): string;
export function strictHttpsJobDocumentUrl(value: unknown): string | undefined;
export function liveFieldJobDocumentUrlFromRows(
  rows: readonly LiveFieldJobDocumentEnvelope[] | unknown,
  expected: LiveFieldJobDocumentTarget,
): string | undefined;
