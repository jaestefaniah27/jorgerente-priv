// Unit tests for the fichar module's pure logic and its midnight auto-close.
// No server: the date/duration helpers are exercised directly and
// closeStaleSessions runs against a throwaway SQLite file, same approach as
// tests/reminder-worker.test.mjs.
//
// Run with: node tests/fichar-unit.test.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

let passed = 0;
let failed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    failures.push(msg);
    console.error(`✗ ${msg}`);
  }
}

// --- The pure helpers, mirrored from src/lib/fichar.ts -----------------
// (The .ts source can't be imported directly from plain Node; these are the
// same implementations, and the API tests cover the real ones end to end.)

const TZ = "Europe/Madrid";

const localDate = (iso) => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(new Date(iso));

function tzOffsetMinutes(at) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value])
  );
  const asUTC = Date.UTC(
    +parts.year, +parts.month - 1, +parts.day,
    +parts.hour % 24, +parts.minute, +parts.second
  );
  return (asUTC - at.getTime()) / 60000;
}

function endOfLocalDayISO(dateStr) {
  const offset = tzOffsetMinutes(new Date(`${dateStr}T12:00:00Z`));
  return new Date(Date.parse(`${dateStr}T23:59:59.999Z`) - offset * 60000).toISOString();
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function mondayOf(dateStr) {
  const dow = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
  return addDays(dateStr, dow === 0 ? -6 : 1 - dow);
}

function sessionTotals(session, nowMs) {
  const start = Date.parse(session.started_at);
  const end = session.ended_at ? Date.parse(session.ended_at) : nowMs;
  const officeMs = Math.max(0, end - start);
  let breakMs = 0;
  for (const b of session.breaks ?? []) {
    const bStart = Date.parse(b.started_at);
    const bEnd = b.ended_at ? Date.parse(b.ended_at) : Math.min(nowMs, end);
    breakMs += Math.max(0, Math.min(bEnd, end) - Math.max(bStart, start));
  }
  breakMs = Math.min(breakMs, officeMs);
  return { officeMs, breakMs, effectiveMs: Math.max(0, officeMs - breakMs) };
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// --- Local dates ------------------------------------------------------

// Summer (CEST, +02:00): 00:30 UTC on 16 July is already the 16th at 02:30 local.
ok(localDate("2026-07-16T00:30:00.000Z") === "2026-07-16", "localDate in summer, after local midnight");
// 23:30 UTC on 15 July is 01:30 on the 16th in Madrid — the local day has rolled over.
ok(localDate("2026-07-15T23:30:00.000Z") === "2026-07-16", "localDate in summer rolls over before UTC midnight");
// Winter (CET, +01:00): 23:30 UTC on 15 January is 00:30 on the 16th.
ok(localDate("2026-01-15T23:30:00.000Z") === "2026-01-16", "localDate in winter rolls over before UTC midnight");
ok(localDate("2026-01-15T22:30:00.000Z") === "2026-01-15", "localDate in winter stays on the same day at 22:30 UTC");

ok(
  endOfLocalDayISO("2026-07-16") === "2026-07-16T21:59:59.999Z",
  `end of a summer day is 21:59:59.999Z (got ${endOfLocalDayISO("2026-07-16")})`
);
ok(
  endOfLocalDayISO("2026-01-16") === "2026-01-16T22:59:59.999Z",
  `end of a winter day is 22:59:59.999Z (got ${endOfLocalDayISO("2026-01-16")})`
);
ok(
  localDate(endOfLocalDayISO("2026-07-16")) === "2026-07-16",
  "the end of a day still belongs to that same local day"
);

// 2026-09-06 is a Sunday: its week starts on Monday the 31st of August.
ok(mondayOf("2026-09-06") === "2026-08-31", `mondayOf a Sunday looks back (got ${mondayOf("2026-09-06")})`);
ok(mondayOf("2026-09-07") === "2026-09-07", "mondayOf a Monday is itself");
ok(mondayOf("2026-09-09") === "2026-09-07", "mondayOf a Wednesday");
ok(addDays("2026-02-28", 1) === "2026-03-01", "addDays crosses a month boundary");
ok(addDays("2026-03-29", 1) === "2026-03-30", "addDays crosses the spring DST change");

// --- Durations --------------------------------------------------------

const closed = {
  started_at: "2026-09-07T07:00:00.000Z",
  ended_at: "2026-09-07T15:00:00.000Z",
  breaks: [{ started_at: "2026-09-07T12:00:00.000Z", ended_at: "2026-09-07T12:45:00.000Z" }],
};
let t = sessionTotals(closed, Date.parse("2026-09-08T00:00:00.000Z"));
ok(t.officeMs === 8 * HOUR, `closed session office time (got ${t.officeMs / HOUR}h)`);
ok(t.breakMs === 45 * MINUTE, `closed session break time (got ${t.breakMs / MINUTE}m)`);
ok(t.effectiveMs === 8 * HOUR - 45 * MINUTE, "closed session effective time = office - break");

const nowMs = Date.parse("2026-09-07T11:00:00.000Z");
const openSession = {
  started_at: "2026-09-07T07:00:00.000Z",
  ended_at: null,
  breaks: [{ started_at: "2026-09-07T10:30:00.000Z", ended_at: null }],
};
t = sessionTotals(openSession, nowMs);
ok(t.officeMs === 4 * HOUR, `open session counts up to now (got ${t.officeMs / HOUR}h)`);
ok(t.breakMs === 30 * MINUTE, `open break counts up to now (got ${t.breakMs / MINUTE}m)`);
ok(t.effectiveMs === 3.5 * HOUR, "open session effective time");

// A break left open when the session was closed must be truncated to the
// session end, never counted up to "now".
const truncated = {
  started_at: "2026-09-07T07:00:00.000Z",
  ended_at: "2026-09-07T15:00:00.000Z",
  breaks: [{ started_at: "2026-09-07T14:00:00.000Z", ended_at: null }],
};
t = sessionTotals(truncated, Date.parse("2026-09-09T00:00:00.000Z"));
ok(t.breakMs === 1 * HOUR, `open break is truncated to the session end (got ${t.breakMs / HOUR}h)`);
ok(t.effectiveMs === 7 * HOUR && t.effectiveMs >= 0, "effective time stays sane and non-negative");

// Break time can never exceed office time, whatever the data looks like.
const absurd = {
  started_at: "2026-09-07T07:00:00.000Z",
  ended_at: "2026-09-07T08:00:00.000Z",
  breaks: [
    { started_at: "2026-09-07T07:00:00.000Z", ended_at: "2026-09-07T08:00:00.000Z" },
    { started_at: "2026-09-07T07:30:00.000Z", ended_at: "2026-09-07T08:00:00.000Z" },
  ],
};
t = sessionTotals(absurd, Date.now());
ok(t.breakMs <= t.officeMs && t.effectiveMs === 0, "break time is clamped to office time");

// --- closeStaleSessions against a real database -----------------------

const dbPath = path.join(os.tmpdir(), `fichar-unit-${Date.now()}.sqlite`);
const db = new Database(dbPath);
db.pragma("foreign_keys = ON");
db.exec(`
  CREATE TABLE work_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL, ended_at TEXT, local_date TEXT NOT NULL,
    auto_closed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE work_breaks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
    started_at TEXT NOT NULL, ended_at TEXT,
    created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT ''
  );
`);

function closeStaleSessions(nowIso) {
  const today = localDate(nowIso);
  const stale = db
    .prepare("SELECT id, local_date FROM work_sessions WHERE ended_at IS NULL AND local_date < ?")
    .all(today);
  const closeSession = db.prepare(
    "UPDATE work_sessions SET ended_at = ?, auto_closed = 1, updated_at = ? WHERE id = ?"
  );
  const closeBreaks = db.prepare(
    "UPDATE work_breaks SET ended_at = ?, updated_at = ? WHERE session_id = ? AND ended_at IS NULL"
  );
  for (const row of stale) {
    const end = endOfLocalDayISO(row.local_date);
    closeSession.run(end, nowIso, row.id);
    closeBreaks.run(end, nowIso, row.id);
  }
  return stale.length;
}

const NOW = "2026-09-08T09:00:00.000Z"; // 11:00 Madrid on the 8th

// Yesterday's session, left open, with an open break inside it.
const yesterday = db
  .prepare("INSERT INTO work_sessions (started_at, ended_at, local_date) VALUES (?, NULL, ?)")
  .run("2026-09-07T07:00:00.000Z", "2026-09-07");
db.prepare("INSERT INTO work_breaks (session_id, started_at, ended_at) VALUES (?, ?, NULL)").run(
  yesterday.lastInsertRowid,
  "2026-09-07T12:00:00.000Z"
);
// Today's session, also open — must be left alone.
const today = db
  .prepare("INSERT INTO work_sessions (started_at, ended_at, local_date) VALUES (?, NULL, ?)")
  .run("2026-09-08T06:30:00.000Z", "2026-09-08");

const closedCount = closeStaleSessions(NOW);
ok(closedCount === 1, `only the stale session is closed (got ${closedCount})`);

const staleRow = db.prepare("SELECT * FROM work_sessions WHERE id = ?").get(yesterday.lastInsertRowid);
ok(
  staleRow.ended_at === "2026-09-07T21:59:59.999Z",
  `stale session ends at yesterday's local midnight (got ${staleRow.ended_at})`
);
ok(staleRow.auto_closed === 1, "stale session is flagged auto_closed");
ok(
  localDate(staleRow.ended_at) === "2026-09-07",
  "the auto-closed end time still falls on the session's own local day"
);

const staleBreak = db.prepare("SELECT * FROM work_breaks WHERE session_id = ?").get(yesterday.lastInsertRowid);
ok(staleBreak.ended_at === "2026-09-07T21:59:59.999Z", "its open break is closed at the same instant");

const todayRow = db.prepare("SELECT * FROM work_sessions WHERE id = ?").get(today.lastInsertRowid);
ok(todayRow.ended_at === null && todayRow.auto_closed === 0, "today's open session is untouched");

// Running it again changes nothing.
ok(closeStaleSessions(NOW) === 0, "running it twice is a no-op");

db.close();
fs.rmSync(dbPath, { force: true });
fs.rmSync(`${dbPath}-wal`, { force: true });
fs.rmSync(`${dbPath}-shm`, { force: true });

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:\n" + failures.map((f) => ` - ${f}`).join("\n"));
  process.exit(1);
}
