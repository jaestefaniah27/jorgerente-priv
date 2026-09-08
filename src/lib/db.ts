import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DB_PATH =
  process.env.KANBAN_DB_PATH || path.join(process.cwd(), "data", "kanban.sqlite");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// Reuse a single connection across hot-reloads in dev.
const globalForDb = globalThis as unknown as { __kanbanDb?: Database.Database };

export const db: Database.Database =
  globalForDb.__kanbanDb ?? new Database(DB_PATH);

if (!globalForDb.__kanbanDb) {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  globalForDb.__kanbanDb = db;
}

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS epics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#f59e0b',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  epic_id INTEGER REFERENCES epics(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','urgent')),
  status TEXT NOT NULL DEFAULT 'backlog' CHECK(status IN ('backlog','todo','in_progress','done')),
  estimate_minutes INTEGER,
  due_at TEXT,
  reminder_offset_minutes INTEGER,
  reminder_at TEXT,
  reminder_sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS time_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  minutes INTEGER NOT NULL CHECK(minutes > 0),
  note TEXT NOT NULL DEFAULT '',
  logged_on TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_epic ON tasks(epic_id);
CREATE INDEX IF NOT EXISTS idx_tasks_reminder ON tasks(reminder_at, reminder_sent_at);
CREATE INDEX IF NOT EXISTS idx_time_entries_task ON time_entries(task_id);
`;

// Adds the 'backlog' status to the tasks table's CHECK constraint. SQLite
// can't ALTER a CHECK constraint in place, so this rebuilds the table when
// an older schema (without 'backlog') is detected — renaming it aside,
// creating the new table, copying every row across unchanged, then
// dropping the old one (which also drops its now-orphaned indexes, since
// SQLite ties indexes to the table they were built on; ensureSchema's
// CREATE INDEX IF NOT EXISTS calls below recreate them on the new table).
// Runs once at startup; a no-op on a fresh or already-migrated database.
function migrateBacklogStatus() {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tasks'")
    .get() as { sql: string } | undefined;
  if (!row || row.sql.includes("'backlog'")) return;

  db.exec("ALTER TABLE tasks RENAME TO tasks_pre_backlog_migration");
  db.exec(`
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      epic_id INTEGER REFERENCES epics(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','urgent')),
      status TEXT NOT NULL DEFAULT 'backlog' CHECK(status IN ('backlog','todo','in_progress','done')),
      estimate_minutes INTEGER,
      due_at TEXT,
      reminder_offset_minutes INTEGER,
      reminder_at TEXT,
      reminder_sent_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )
  `);
  db.exec("INSERT INTO tasks SELECT * FROM tasks_pre_backlog_migration");
  db.exec("DROP TABLE tasks_pre_backlog_migration");
}

let migrated = false;
export function ensureSchema() {
  if (migrated) return;
  migrateBacklogStatus();
  db.exec(SCHEMA_SQL);
  migrated = true;
}

ensureSchema();
