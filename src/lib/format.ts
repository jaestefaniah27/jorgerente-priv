export function minutesToHoursLabel(minutes: number | null | undefined): string {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// "02:47:15" — for the big live counter. Hours are not capped at 24 and
// there is no day rollover: a counter reading 26h is clearer than "1d 2h".
export function msToClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

// "2h 47m" — for every counter that isn't the big one. Seconds would only
// add noise on totals nobody reads to the second.
export function msToShort(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function formatDueDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isOverdue(iso: string | null, status: string): boolean {
  if (!iso || status === "done") return false;
  return new Date(iso).getTime() < Date.now();
}

export const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-sky-100 text-sky-700",
  high: "bg-amber-100 text-amber-800",
  urgent: "bg-rose-100 text-rose-700",
};
