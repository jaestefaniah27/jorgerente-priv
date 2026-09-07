import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  ApiError,
  handle,
  optionalNumber,
  optionalString,
  parseIdParam,
} from "@/lib/api-helpers";
import { computeReminderAt } from "@/lib/reminders";
import { PRIORITIES, STATUSES, type Priority, type Status, type Task } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

function getTaskOr404(id: number): Task {
  const task = db.prepare<[number], Task>("SELECT * FROM tasks WHERE id = ?").get(id);
  if (!task) throw new ApiError(404, "Tarea no encontrada");
  return task;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const id = parseIdParam((await ctx.params).id);
    const task = getTaskOr404(id);
    const timeEntries = db
      .prepare("SELECT * FROM time_entries WHERE task_id = ? ORDER BY logged_on DESC, id DESC")
      .all(id);
    return NextResponse.json({ task, timeEntries });
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const id = parseIdParam((await ctx.params).id);
    const existing = getTaskOr404(id);
    const body = await req.json();

    const title = optionalString(body, "title");
    if (title !== undefined && !title.trim()) {
      throw new ApiError(400, 'El campo "title" no puede estar vacío');
    }
    const description = optionalString(body, "description");

    let priority: Priority | undefined;
    if (body.priority !== undefined) {
      priority = body.priority as Priority;
      if (!PRIORITIES.includes(priority)) throw new ApiError(400, "Prioridad inválida");
    }

    let status: Status | undefined;
    if (body.status !== undefined) {
      status = body.status as Status;
      if (!STATUSES.includes(status)) throw new ApiError(400, "Estado inválido");
    }

    const epicId: number | null | undefined = optionalNumber(body, "epic_id");
    if (epicId) {
      const epic = db
        .prepare("SELECT id FROM epics WHERE id = ? AND project_id = ?")
        .get(epicId, existing.project_id);
      if (!epic) throw new ApiError(400, "La épica no pertenece a este proyecto");
    }

    const estimateMinutes = optionalNumber(body, "estimate_minutes");

    // due_at / reminder handling: recompute reminder_at whenever either changes.
    const dueAtProvided = Object.prototype.hasOwnProperty.call(body, "due_at");
    const offsetProvided = Object.prototype.hasOwnProperty.call(body, "reminder_offset_minutes");
    const nextDueAt = dueAtProvided ? optionalString(body, "due_at") ?? null : existing.due_at;
    let nextOffset = offsetProvided
      ? optionalNumber(body, "reminder_offset_minutes") ?? null
      : existing.reminder_offset_minutes;

    if (!nextDueAt) {
      // Clearing the due date always clears any reminder too.
      nextOffset = null;
    } else if (nextOffset != null && nextOffset < 0) {
      throw new ApiError(400, "El aviso no puede ser negativo");
    }

    const nextReminderAt = computeReminderAt(nextDueAt, nextOffset);
    const reminderChanged =
      nextReminderAt !== existing.reminder_at || nextDueAt !== existing.due_at;

    db.prepare(
      `UPDATE tasks SET
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        priority = COALESCE(?, priority),
        status = COALESCE(?, status),
        epic_id = ?,
        estimate_minutes = ?,
        due_at = ?,
        reminder_offset_minutes = ?,
        reminder_at = ?,
        reminder_sent_at = CASE WHEN ? THEN NULL ELSE reminder_sent_at END,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?`
    ).run(
      title?.trim() ?? null,
      description ?? null,
      priority ?? null,
      status ?? null,
      epicId === undefined ? existing.epic_id : epicId,
      estimateMinutes === undefined ? existing.estimate_minutes : estimateMinutes,
      nextDueAt,
      nextOffset,
      nextReminderAt,
      reminderChanged ? 1 : 0,
      id
    );

    const task = getTaskOr404(id);
    return NextResponse.json({ task });
  });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const id = parseIdParam((await ctx.params).id);
    getTaskOr404(id);
    db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  });
}
