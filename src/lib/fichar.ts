// Pure logic for the "fichar" (time clock) module: local-date arithmetic and
// duration maths. Deliberately free of any database import so client
// components can use the exact same formulas as the API — the counters on
// screen and the totals in the history must never disagree.

export const TZ = "Europe/Madrid";

export interface WorkBreak {
  id: number;
  session_id: number;
  started_at: string;
  ended_at: string | null;
}

export interface WorkSession {
  id: number;
  started_at: string;
  ended_at: string | null;
  local_date: string;
  auto_closed: number;
  breaks: WorkBreak[];
}

export interface Totals {
  officeMs: number;
  breakMs: number;
  effectiveMs: number;
}

export const ZERO_TOTALS: Totals = { officeMs: 0, breakMs: 0, effectiveMs: 0 };

export interface WeekDay {
  date: string;
  sessions: WorkSession[];
  totals: Totals;
}

// --- Local dates -----------------------------------------------------

// "YYYY-MM-DD" in Madrid. sv-SE already formats dates that way.
export function localDate(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(new Date(iso));
}

export function isDateString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));
}

function tzOffsetMinutes(at: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value])
  ) as Record<string, string>;
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  );
  return (asUTC - at.getTime()) / 60000;
}

// The ISO instant of 23:59:59.999 local time on that date.
// The offset is measured at midday: Spain's DST switches happen in the small
// hours, so 23:59 always carries the same offset as 12:00 of the same day.
export function endOfLocalDayISO(dateStr: string): string {
  const offset = tzOffsetMinutes(new Date(`${dateStr}T12:00:00Z`));
  return new Date(Date.parse(`${dateStr}T23:59:59.999Z`) - offset * 60000).toISOString();
}

export function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Monday of that date's week (weeks run Monday → Sunday).
export function mondayOf(dateStr: string): string {
  const dow = new Date(`${dateStr}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(dateStr, dow === 0 ? -6 : 1 - dow);
}

export function isMonday(dateStr: string): boolean {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay() === 1;
}

export function todayLocal(nowMs: number = Date.now()): string {
  return localDate(new Date(nowMs).toISOString());
}

// --- Durations -------------------------------------------------------

export function sessionTotals(session: WorkSession, nowMs: number): Totals {
  const start = Date.parse(session.started_at);
  const end = session.ended_at ? Date.parse(session.ended_at) : nowMs;
  const officeMs = Math.max(0, end - start);

  let breakMs = 0;
  for (const b of session.breaks ?? []) {
    const bStart = Date.parse(b.started_at);
    // An open break never counts past the end of its session.
    const bEnd = b.ended_at ? Date.parse(b.ended_at) : Math.min(nowMs, end);
    breakMs += Math.max(0, Math.min(bEnd, end) - Math.max(bStart, start));
  }
  breakMs = Math.min(breakMs, officeMs);

  return { officeMs, breakMs, effectiveMs: Math.max(0, officeMs - breakMs) };
}

export function sumTotals(list: Totals[]): Totals {
  return list.reduce<Totals>(
    (acc, t) => ({
      officeMs: acc.officeMs + t.officeMs,
      breakMs: acc.breakMs + t.breakMs,
      effectiveMs: acc.effectiveMs + t.effectiveMs,
    }),
    { ...ZERO_TOTALS }
  );
}

export function totalsForSessions(sessions: WorkSession[], nowMs: number): Totals {
  return sumTotals(sessions.map((s) => sessionTotals(s, nowMs)));
}

// --- Press compensation ----------------------------------------------

// The clock buttons are press-and-hold, so the action is recorded at the
// instant the press STARTED, not when the hold completed — holding for two
// seconds shouldn't cost two seconds of logged time. The client sends a
// duration rather than an absolute timestamp so a skewed phone clock can't
// corrupt the record. Anything out of range is ignored rather than rejected.
export const MAX_PRESS_COMPENSATION_MS = 10_000;

export function compensatedNow(pressedMsAgo: unknown, nowMs: number = Date.now()): string {
  const n = typeof pressedMsAgo === "number" ? pressedMsAgo : Number(pressedMsAgo);
  const valid = Number.isFinite(n) && n >= 0 && n <= MAX_PRESS_COMPENSATION_MS;
  return new Date(nowMs - (valid ? Math.round(n) : 0)).toISOString();
}
