// Unit tests for the reminder worker's scheduling logic (tests/api.test.mjs
// covers the HTTP surface; this covers the standalone worker script that
// actually dispatches Web Push, using a throwaway DB and a fake sender so
// no real push service is involved).

import { createWorker } from "../scripts/reminder-worker.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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

function freshDbPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kanban-worker-")), "test.sqlite");
}

async function main() {
  // --- Basic: due reminder gets sent and marked ------------------------
  {
    const dbPath = freshDbPath();
    const sent = [];
    const { db, tick } = createWorker({
      dbPath,
      sendNotification: async (sub, payload) => {
        sent.push({ sub, payload });
        return { ok: true };
      },
    });

    db.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT, color TEXT, created_at TEXT DEFAULT '');
      CREATE TABLE epics (id INTEGER PRIMARY KEY, project_id INTEGER, name TEXT, color TEXT, created_at TEXT DEFAULT '');
      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY, project_id INTEGER, epic_id INTEGER, title TEXT, description TEXT DEFAULT '',
        priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'todo', estimate_minutes INTEGER,
        due_at TEXT, reminder_offset_minutes INTEGER, reminder_at TEXT, reminder_sent_at TEXT,
        created_at TEXT DEFAULT '', updated_at TEXT DEFAULT ''
      );
      CREATE TABLE push_subscriptions (id INTEGER PRIMARY KEY, endpoint TEXT UNIQUE, p256dh TEXT, auth TEXT, created_at TEXT DEFAULT '');
    `);
    db.prepare("INSERT INTO projects (id, name, color) VALUES (1, 'Test', '#000')").run();
    db.prepare(
      "INSERT INTO push_subscriptions (endpoint, p256dh, auth) VALUES ('http://x/1', 'p', 'a')"
    ).run();

    const now = new Date("2026-01-01T12:00:00.000Z");
    const past = new Date(now.getTime() - 60_000).toISOString();
    const future = new Date(now.getTime() + 60_000).toISOString();

    db.prepare(
      `INSERT INTO tasks (id, project_id, title, status, reminder_at, reminder_sent_at)
       VALUES (1, 1, 'Due now', 'todo', ?, NULL)`
    ).run(past);
    db.prepare(
      `INSERT INTO tasks (id, project_id, title, status, reminder_at, reminder_sent_at)
       VALUES (2, 1, 'Not due yet', 'todo', ?, NULL)`
    ).run(future);
    db.prepare(
      `INSERT INTO tasks (id, project_id, title, status, reminder_at, reminder_sent_at)
       VALUES (3, 1, 'Already sent', 'todo', ?, ?)`
    ).run(past, past);
    db.prepare(
      `INSERT INTO tasks (id, project_id, title, status, reminder_at, reminder_sent_at)
       VALUES (4, 1, 'Done task, skip', 'done', ?, NULL)`
    ).run(past);

    const result = await tick(now);

    ok(result.processed === 1, `only the one due, unsent, non-done reminder is processed (got ${result.processed})`);
    ok(sent.length === 1, `push was sent exactly once (got ${sent.length})`);
    ok(sent[0]?.payload.title.includes("Due now"), "push payload references the right task");

    const row1 = db.prepare("SELECT reminder_sent_at FROM tasks WHERE id = 1").get();
    ok(row1.reminder_sent_at === now.toISOString(), "due task marked as sent");

    const row2 = db.prepare("SELECT reminder_sent_at FROM tasks WHERE id = 2").get();
    ok(row2.reminder_sent_at === null, "future reminder left untouched");

    // Second tick should not resend.
    const result2 = await tick(now);
    ok(result2.processed === 0, "reminder is not reprocessed on a later tick");

    db.close();
  }

  // --- Expired subscription gets removed --------------------------------
  {
    const dbPath = freshDbPath();
    const { db, tick } = createWorker({
      dbPath,
      sendNotification: async () => ({ ok: false, expired: true }),
    });
    db.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT, color TEXT, created_at TEXT DEFAULT '');
      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY, project_id INTEGER, title TEXT, status TEXT DEFAULT 'todo',
        reminder_at TEXT, reminder_sent_at TEXT, created_at TEXT DEFAULT '', updated_at TEXT DEFAULT ''
      );
      CREATE TABLE push_subscriptions (id INTEGER PRIMARY KEY, endpoint TEXT UNIQUE, p256dh TEXT, auth TEXT, created_at TEXT DEFAULT '');
    `);
    db.prepare("INSERT INTO projects (id, name, color) VALUES (1, 'Test', '#000')").run();
    db.prepare("INSERT INTO push_subscriptions (endpoint, p256dh, auth) VALUES ('http://x/1', 'p', 'a')").run();
    const now = new Date("2026-01-01T12:00:00.000Z");
    db.prepare(
      "INSERT INTO tasks (id, project_id, title, reminder_at) VALUES (1, 1, 'Due now', ?)"
    ).run(new Date(now.getTime() - 1000).toISOString());

    await tick(now);
    const remaining = db.prepare("SELECT COUNT(*) AS n FROM push_subscriptions").get();
    ok(remaining.n === 0, "expired subscription is deleted after a failed send");
    db.close();
  }

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
