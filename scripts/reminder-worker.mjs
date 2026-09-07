// Standalone worker that polls the Kanban SQLite DB for due reminders and
// sends Web Push notifications. Runs as its own PM2 process, independent
// from the Next.js server, so a slow/crashed web request never affects
// reminder delivery and vice versa.
//
// Exports `createWorker` so the scheduling logic can be unit tested without
// touching the network (by injecting a fake `sendNotification`).

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "kanban.sqlite");

export function createWorker({ dbPath = process.env.KANBAN_DB_PATH || DEFAULT_DB_PATH, sendNotification } = {}) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  async function tick(now = new Date()) {
    const nowIso = now.toISOString();
    const due = db
      .prepare(
        `SELECT * FROM tasks
         WHERE reminder_at IS NOT NULL
           AND reminder_sent_at IS NULL
           AND reminder_at <= ?
           AND status != 'done'`
      )
      .all(nowIso);

    const subs = db.prepare("SELECT * FROM push_subscriptions").all();
    const results = [];

    for (const task of due) {
      const payload = {
        title: `Vence: ${task.title}`,
        body: task.due_at
          ? `Fecha límite: ${new Date(task.due_at).toLocaleString("es-ES")}`
          : "Tienes una tarea próxima a vencer",
        url: `/kanban/board/${task.project_id}`,
      };

      let anySent = false;
      for (const sub of subs) {
        const result = await sendNotification(sub, payload);
        results.push({ taskId: task.id, subscriptionId: sub.id, ...result });
        if (result.ok) anySent = true;
        if (!result.ok && result.expired) {
          db.prepare("DELETE FROM push_subscriptions WHERE id = ?").run(sub.id);
        }
      }

      // Mark as processed regardless of subscriber count, so a reminder
      // with zero registered devices doesn't get retried forever.
      db.prepare("UPDATE tasks SET reminder_sent_at = ? WHERE id = ?").run(nowIso, task.id);
      results.push({
        taskId: task.id,
        markedSent: true,
        hadSubscribers: subs.length > 0,
        anySent,
      });
    }

    return { processed: due.length, subscriptionCount: subs.length, results };
  }

  return { db, tick };
}

// Mirrors src/lib/push.ts's sendPushToSubscription. Duplicated (rather than
// imported) because this file runs under plain Node, not the Next.js/TS
// toolchain — kept intentionally tiny so the duplication is cheap to keep
// in sync.
async function realSendNotification(sub, payload) {
  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:jaestefaniah27@gmail.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
    return { ok: true };
  } catch (err) {
    const statusCode = err && typeof err === "object" ? err.statusCode : undefined;
    if (statusCode === 404 || statusCode === 410) return { ok: false, expired: true };
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const POLL_MS = Number(process.env.REMINDER_POLL_MS || 60_000);
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.error(
      "[reminder-worker] Faltan VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY en el entorno; el worker no puede enviar avisos."
    );
  }
  const { tick } = createWorker({ sendNotification: realSendNotification });
  console.log(`[reminder-worker] arrancado, revisando cada ${POLL_MS}ms`);

  async function loop() {
    try {
      const result = await tick();
      if (result.processed > 0) {
        console.log(`[reminder-worker] procesados ${result.processed} aviso(s)`, result.results);
      }
    } catch (err) {
      console.error("[reminder-worker] error en tick", err);
    } finally {
      setTimeout(loop, POLL_MS);
    }
  }

  loop();
}
