/**
 * Pure helpers for due-date / reminder scheduling. Kept dependency-free and
 * side-effect-free so they're trivial to unit test.
 */

/**
 * Given a due date (ISO string) and an offset in minutes, returns the ISO
 * timestamp at which the reminder should fire ("offset" minutes before the
 * due date). Returns null if either input is missing.
 */
export function computeReminderAt(
  dueAt: string | null | undefined,
  offsetMinutes: number | null | undefined
): string | null {
  if (!dueAt || offsetMinutes == null) return null;
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return null;
  const reminderMs = due.getTime() - offsetMinutes * 60_000;
  return new Date(reminderMs).toISOString();
}

export function isValidOffset(minutes: unknown): minutes is number {
  return typeof minutes === "number" && Number.isFinite(minutes) && minutes >= 0;
}
