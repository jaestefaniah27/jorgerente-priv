// Database access for the "fichar" module. Server-only (imports better-sqlite3
// via db.ts); the pure formulas live in fichar.ts so the browser can share them.

import { db } from "./db";
import {
  addDays,
  endOfLocalDayISO,
  localDate,
  mondayOf,
  totalsForSessions,
  type Totals,
  type WeekDay,
  type WorkBreak,
  type WorkSession,
} from "./fichar";

type SessionRow = Omit<WorkSession, "breaks">;

function attachBreaks(rows: SessionRow[]): WorkSession[] {
  if (rows.length === 0) return [];
  const placeholders = rows.map(() => "?").join(",");
  const breaks = db
    .prepare<number[], WorkBreak>(
      `SELECT id, session_id, started_at, ended_at FROM work_breaks
       WHERE session_id IN (${placeholders}) ORDER BY started_at ASC, id ASC`
    )
    .all(...rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, breaks: breaks.filter((b) => b.session_id === r.id) }));
}

const SESSION_COLUMNS = "id, started_at, ended_at, local_date, auto_closed";

export function getSessionById(id: number): WorkSession | null {
  const row = db
    .prepare<[number], SessionRow>(`SELECT ${SESSION_COLUMNS} FROM work_sessions WHERE id = ?`)
    .get(id);
  return row ? attachBreaks([row])[0] : null;
}

export function getBreakById(id: number): WorkBreak | null {
  return (
    db
      .prepare<[number], WorkBreak>(
        "SELECT id, session_id, started_at, ended_at FROM work_breaks WHERE id = ?"
      )
      .get(id) ?? null
  );
}

export function getOpenSession(): WorkSession | null {
  const row = db
    .prepare<[], SessionRow>(
      `SELECT ${SESSION_COLUMNS} FROM work_sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1`
    )
    .get();
  return row ? attachBreaks([row])[0] : null;
}

export function getOpenBreak(sessionId: number): WorkBreak | null {
  return (
    db
      .prepare<[number], WorkBreak>(
        `SELECT id, session_id, started_at, ended_at FROM work_breaks
         WHERE session_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1`
      )
      .get(sessionId) ?? null
  );
}

export function getSessionsBetween(fromDate: string, toDate: string): WorkSession[] {
  const rows = db
    .prepare<[string, string], SessionRow>(
      `SELECT ${SESSION_COLUMNS} FROM work_sessions
       WHERE local_date >= ? AND local_date <= ?
       ORDER BY started_at ASC`
    )
    .all(fromDate, toDate);
  return attachBreaks(rows);
}

// Closes any session left open on a previous local day, ending it at
// 23:59:59.999 of the day it started — not at the moment this happens to run.
// Flagged with auto_closed so the UI can ask Jorge to review it.
//
// Called at the top of every /api/fichar handler, which is why the module
// needs no cron: a forgotten session is corrected the next time the app is
// opened, and the recorded end time is right either way.
export function closeStaleSessions(nowIso: string = new Date().toISOString()): number {
  const today = localDate(nowIso);
  const stale = db
    .prepare<[string], SessionRow>(
      `SELECT ${SESSION_COLUMNS} FROM work_sessions WHERE ended_at IS NULL AND local_date < ?`
    )
    .all(today);
  if (stale.length === 0) return 0;

  const closeSession = db.prepare(
    "UPDATE work_sessions SET ended_at = ?, auto_closed = 1, updated_at = ? WHERE id = ?"
  );
  const closeBreaks = db.prepare(
    "UPDATE work_breaks SET ended_at = ?, updated_at = ? WHERE session_id = ? AND ended_at IS NULL"
  );
  const run = db.transaction((rows: SessionRow[]) => {
    for (const row of rows) {
      const end = endOfLocalDayISO(row.local_date);
      closeSession.run(end, nowIso, row.id);
      closeBreaks.run(end, nowIso, row.id);
    }
  });
  run(stale);
  return stale.length;
}

export function hasRecentAutoClosed(nowIso: string = new Date().toISOString()): boolean {
  const since = addDays(localDate(nowIso), -7);
  const row = db
    .prepare<[string], { n: number }>(
      "SELECT COUNT(*) AS n FROM work_sessions WHERE auto_closed = 1 AND local_date >= ?"
    )
    .get(since);
  return (row?.n ?? 0) > 0;
}

export function buildWeek(startMonday: string, nowMs: number): { days: WeekDay[]; totals: Totals } {
  const end = addDays(startMonday, 6);
  const sessions = getSessionsBetween(startMonday, end);
  const days: WeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(startMonday, i);
    const daySessions = sessions.filter((s) => s.local_date === date);
    days.push({ date, sessions: daySessions, totals: totalsForSessions(daySessions, nowMs) });
  }
  return { days, totals: totalsForSessions(sessions, nowMs) };
}

export function totalsForDate(date: string, nowMs: number): Totals {
  return totalsForSessions(getSessionsBetween(date, date), nowMs);
}

export interface ClockState {
  session: WorkSession | null;
  todayClosed: Totals;
  weekClosed: Totals;
  todayDate: string;
  weekStart: string;
  hasAutoClosed: boolean;
}

// The totals here deliberately EXCLUDE the session still running: the browser
// adds that part itself, once per second, from the same formulas. Baking a
// server-side snapshot of a running session into the total would freeze the
// counter until the next request.
export function buildClockState(nowMs: number = Date.now()): ClockState {
  const nowIso = new Date(nowMs).toISOString();
  const todayDate = localDate(nowIso);
  const weekStart = mondayOf(todayDate);
  const open = getOpenSession();
  const notOpen = (s: WorkSession) => s.id !== open?.id;

  return {
    session: open,
    todayClosed: totalsForSessions(getSessionsBetween(todayDate, todayDate).filter(notOpen), nowMs),
    weekClosed: totalsForSessions(
      getSessionsBetween(weekStart, addDays(weekStart, 6)).filter(notOpen),
      nowMs
    ),
    todayDate,
    weekStart,
    hasAutoClosed: hasRecentAutoClosed(nowIso),
  };
}
