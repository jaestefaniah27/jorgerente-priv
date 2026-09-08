// Integration tests for the fichar API. Plain Node, same shape as
// tests/api.test.mjs. Expects the app running at BASE_URL against a
// throwaway database.

const BASE = process.env.BASE_URL || "http://localhost:3900";

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

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // no body
  }
  return { status: res.status, json };
}

const TZ = "Europe/Madrid";
const todayLocal = () => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(new Date());
function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function mondayOf(dateStr) {
  const dow = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
  return addDays(dateStr, dow === 0 ? -6 : 1 - dow);
}

async function main() {
  console.log(`Running fichar API tests against ${BASE}`);

  // --- Empty state ------------------------------------------------------
  let r = await api("GET", "/api/fichar/state");
  ok(r.status === 200, `state -> 200 (got ${r.status})`);
  ok(r.json.session === null, "no open session on a fresh database");
  ok(r.json.todayClosed.officeMs === 0 && r.json.weekClosed.officeMs === 0, "totals start at zero");
  ok(r.json.hasAutoClosed === false, "no auto-closed sessions to review");
  ok(r.json.todayDate === todayLocal(), "state reports today's local date");

  // --- Clock in ---------------------------------------------------------
  r = await api("POST", "/api/fichar/clock-in");
  ok(r.status === 201, `clock-in -> 201 (got ${r.status})`);
  const session = r.json.session;
  ok(session.ended_at === null, "new session is open");
  ok(session.local_date === todayLocal(), "session lands on today's local date");
  ok(Array.isArray(session.breaks) && session.breaks.length === 0, "new session has no breaks");

  r = await api("POST", "/api/fichar/clock-in");
  ok(r.status === 400, `clock-in twice -> 400 (got ${r.status})`);

  // --- Breaks -----------------------------------------------------------
  r = await api("POST", "/api/fichar/break/start");
  ok(r.status === 201, `break start -> 201 (got ${r.status})`);
  const firstBreak = r.json.break;
  ok(firstBreak.ended_at === null, "break is open");

  r = await api("POST", "/api/fichar/break/start");
  ok(r.status === 400, `break start twice -> 400 (got ${r.status})`);

  r = await api("POST", "/api/fichar/break/stop");
  ok(r.status === 200 && r.json.break.ended_at !== null, "break stop closes it");

  r = await api("POST", "/api/fichar/break/stop");
  ok(r.status === 400, `break stop twice -> 400 (got ${r.status})`);

  // --- Clock out closes a running break --------------------------------
  r = await api("POST", "/api/fichar/break/start");
  ok(r.status === 201, "second break started");

  r = await api("POST", "/api/fichar/clock-out");
  ok(r.status === 200, `clock-out -> 200 (got ${r.status})`);
  const closed = r.json.session;
  ok(closed.ended_at !== null, "session is closed");
  ok(
    closed.breaks.every((b) => b.ended_at !== null),
    "clocking out also closes the running break"
  );
  ok(
    closed.breaks.every((b) => Date.parse(b.ended_at) <= Date.parse(closed.ended_at)),
    "no break outlives its session"
  );

  r = await api("POST", "/api/fichar/clock-out");
  ok(r.status === 400, `clock-out twice -> 400 (got ${r.status})`);

  r = await api("POST", "/api/fichar/break/start");
  ok(r.status === 400, `break start with no open session -> 400 (got ${r.status})`);

  // --- Totals add up ----------------------------------------------------
  r = await api("GET", "/api/fichar/state");
  const today = r.json.todayClosed;
  ok(today.officeMs > 0, "today's office time is counted after clocking out");
  ok(
    today.effectiveMs === today.officeMs - today.breakMs,
    "effective = office - break"
  );

  // While a session is running, the state totals exclude it on purpose: the
  // browser adds the live part itself.
  r = await api("POST", "/api/fichar/clock-in");
  const running = r.json.session;
  r = await api("GET", "/api/fichar/state");
  ok(
    r.json.session && r.json.session.id === running.id,
    "state returns the running session separately"
  );
  ok(
    r.json.todayClosed.officeMs === today.officeMs,
    "the running session is excluded from todayClosed"
  );
  await api("DELETE", `/api/fichar/sessions/${running.id}`);

  // --- Week -------------------------------------------------------------
  const monday = mondayOf(todayLocal());
  r = await api("GET", `/api/fichar/week?start=${monday}`);
  ok(r.status === 200, `week -> 200 (got ${r.status})`);
  ok(r.json.days.length === 7, `week returns 7 days (got ${r.json.days?.length})`);
  ok(r.json.end === addDays(monday, 6), "week end is the Sunday");
  const todayEntry = r.json.days.find((d) => d.date === todayLocal());
  ok(todayEntry.sessions.length === 1, "today's session shows up in its own day");
  ok(r.json.totals.officeMs === today.officeMs, "week totals include today");

  r = await api("GET", `/api/fichar/week?start=${addDays(monday, 1)}`);
  ok(r.status === 400, `week starting on a Tuesday -> 400 (got ${r.status})`);
  r = await api("GET", `/api/fichar/week?start=nope`);
  ok(r.status === 400, `week with a malformed date -> 400 (got ${r.status})`);

  // --- Editing ----------------------------------------------------------
  const sid = closed.id;
  r = await api("PATCH", `/api/fichar/sessions/${sid}`, {
    ended_at: new Date(Date.parse(closed.started_at) - 60_000).toISOString(),
  });
  ok(r.status === 400, `end before start -> 400 (got ${r.status})`);

  r = await api("PATCH", `/api/fichar/sessions/${sid}`, { started_at: "no soy una fecha" });
  ok(r.status === 400, `unparseable date -> 400 (got ${r.status})`);

  const newEnd = new Date(Date.parse(closed.started_at) + 8 * 3600_000).toISOString();
  r = await api("PATCH", `/api/fichar/sessions/${sid}`, { ended_at: newEnd });
  ok(r.status === 200, `valid edit -> 200 (got ${r.status})`);
  ok(r.json.session.ended_at === newEnd, "edited end time is stored");
  ok(r.json.session.auto_closed === 0, "editing the end time clears the auto-closed flag");

  const bid = closed.breaks[0].id;
  r = await api("PATCH", `/api/fichar/breaks/${bid}`, {
    started_at: new Date(Date.parse(closed.started_at) - 3600_000).toISOString(),
  });
  ok(r.status === 400, `break outside its session -> 400 (got ${r.status})`);

  r = await api("PATCH", `/api/fichar/breaks/${bid}`, {
    started_at: new Date(Date.parse(closed.started_at) + 3600_000).toISOString(),
    ended_at: new Date(Date.parse(closed.started_at) + 3600_000 + 30 * 60_000).toISOString(),
  });
  ok(r.status === 200, `valid break edit -> 200 (got ${r.status})`);

  r = await api("PATCH", "/api/fichar/sessions/999999", { ended_at: newEnd });
  ok(r.status === 404, `patch missing session -> 404 (got ${r.status})`);

  // --- Overlap guard ----------------------------------------------------
  r = await api("POST", "/api/fichar/clock-in");
  const second = r.json.session;
  ok(r.status === 201, "a second session can be opened after clocking out");
  r = await api("PATCH", `/api/fichar/sessions/${second.id}`, {
    started_at: new Date(Date.parse(closed.started_at) + 3600_000).toISOString(),
  });
  ok(r.status === 400, `overlapping sessions -> 400 (got ${r.status})`);
  await api("POST", "/api/fichar/clock-out");

  // --- Press compensation -----------------------------------------------
  await api("DELETE", `/api/fichar/sessions/${second.id}`);
  const before = Date.now();
  r = await api("POST", "/api/fichar/clock-in", { pressed_ms_ago: 2000 });
  ok(r.status === 201, "clock-in with pressed_ms_ago -> 201");
  const drift = before - Date.parse(r.json.session.started_at);
  ok(drift > 1000 && drift < 3500, `press compensation backdates ~2s (got ${drift}ms)`);
  await api("POST", "/api/fichar/clock-out");
  const compensated = r.json.session.id;

  for (const bad of [-5, 999999, "abc", null]) {
    await api("DELETE", `/api/fichar/sessions/${compensated}`);
    r = await api("POST", "/api/fichar/clock-in", { pressed_ms_ago: bad });
    const ageMs = Date.now() - Date.parse(r.json.session?.started_at ?? 0);
    ok(
      r.status === 201 && ageMs < 3000,
      `pressed_ms_ago=${JSON.stringify(bad)} is ignored, not rejected (status ${r.status})`
    );
    await api("DELETE", `/api/fichar/sessions/${r.json.session.id}`);
  }

  // --- Delete cascades --------------------------------------------------
  r = await api("DELETE", `/api/fichar/sessions/${sid}`);
  ok(r.status === 200, `delete session -> 200 (got ${r.status})`);
  r = await api("PATCH", `/api/fichar/breaks/${bid}`, { ended_at: newEnd });
  ok(r.status === 404, "its breaks are gone too (cascade)");
  r = await api("DELETE", "/api/fichar/sessions/999999");
  ok(r.status === 404, `delete missing session -> 404 (got ${r.status})`);

  r = await api("GET", "/api/fichar/state");
  ok(r.json.todayClosed.officeMs === 0, "totals are back to zero once everything is deleted");

  // --- The other module still works -------------------------------------
  r = await api("GET", "/api/kanban/tasks");
  ok(r.status === 200, "the kanban API is unaffected");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error("\nFailures:\n" + failures.map((f) => ` - ${f}`).join("\n"));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test run crashed:", err);
  process.exit(1);
});
