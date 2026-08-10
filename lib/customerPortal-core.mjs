export function portalRequestTargetMatchesJob(appointments, plannerEntryId, jobId) {
  if (!plannerEntryId) return true;
  if (!jobId) return false;
  const appointment = appointments.find((entry) => entry.id === plannerEntryId);
  return Boolean(appointment && appointment.jobId === jobId);
}
