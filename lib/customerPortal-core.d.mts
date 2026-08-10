export interface PortalAppointmentTarget {
  id: string;
  jobId?: string;
}

export function portalRequestTargetMatchesJob<T extends PortalAppointmentTarget>(
  appointments: readonly T[],
  plannerEntryId: string,
  jobId: string,
): boolean;
