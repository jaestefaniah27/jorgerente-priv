import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  ApiError,
  handle,
  optionalNumber,
  optionalString,
  requireString,
} from "@/lib/api-helpers";
import { computeReminderAt } from "@/lib/reminders";
import { DEFAULT_NEW_TASK_STATUS, PRIORITIES, STATUSES, type Priority, type Status } from "@/lib/types";

function parseListParam(value: string | null): number[] | null {
  if (!value) return null;
  const ids = value
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  return ids.length ? ids : null;
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    const { searchParams } = new URL(req.url);
    const projectIds = parseListParam(searchParams.get("projectId"));
    const epicIds = parseListParam(searchParams.get("epicId"));
    const priority = searchParams.get("priority");
    const status = searchParams.get("status");

    const clauses: string[] = [];
    const args: unknown[] = [];

    if (projectIds) {
      clauses.push(`t.project_id IN (${projectIds.map(() => "?").join(",")})`);
      args.push(...projectIds);
    }
    if (epicIds) {
      clauses.push(`t.epic_id IN (${epicIds.map(() => "?").join(",")})`);
      args.push(...epicIds);
    }
    if (priority) {
      if (!PRIORITIES.includes(priority as Priority)) {
        throw new ApiError(400, "Prioridad inválida");
      }
      clauses.push("t.priority = ?");
      args.push(priority);
    }
    if (status) {
      if (!STATUSES.includes(status as Status)) {
        throw new ApiError(400, "Estado inválido");
      }
      clauses.push("t.status = ?");
      args.push(status);
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const tasks = db
      .prepare(
        `SELECT t.*,
                p.name AS project_name, p.color AS project_color,
                e.name AS epic_name, e.color AS epic_color,
                COALESCE(SUM(te.minutes), 0) AS time_spent_minutes
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
         LEFT JOIN epics e ON e.id = t.epic_id
         LEFT JOIN time_entries te ON te.task_id = t.id
         ${where}
         GROUP BY t.id
         ORDER BY t.created_at DESC`
      )
      .all(...args);

    return NextResponse.json({ tasks });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json();
    const projectId = optionalNumber(body, "project_id");
    if (!projectId) throw new ApiError(400, 'El campo "project_id" es obligatorio');
    const project = db.prepare("SELECT id FROM projects WHERE id = ?").get(projectId);
    if (!project) throw new ApiError(404, "Proyecto no encontrado");

    const title = requireString(body, "title");
    const description = optionalString(body, "description") || "";
    const priority = (optionalString(body, "priority") || "medium") as Priority;
    if (!PRIORITIES.includes(priority)) throw new ApiError(400, "Prioridad inválida");
    const status = (optionalString(body, "status") || DEFAULT_NEW_TASK_STATUS) as Status;
    if (!STATUSES.includes(status)) throw new ApiError(400, "Estado inválido");

    let epicId = optionalNumber(body, "epic_id");
    if (epicId) {
      const epic = db
        .prepare("SELECT id FROM epics WHERE id = ? AND project_id = ?")
        .get(epicId, projectId);
      if (!epic) throw new ApiError(400, "La épica no pertenece a este proyecto");
    } else {
      epicId = null;
    }

    const estimateMinutes = optionalNumber(body, "estimate_minutes") ?? null;
    const dueAt = optionalString(body, "due_at") ?? null;
    const reminderOffsetMinutes = optionalNumber(body, "reminder_offset_minutes") ?? null;
    if (reminderOffsetMinutes != null && !dueAt) {
      throw new ApiError(400, "No se puede fijar un aviso sin fecha límite");
    }
    const reminderAt = computeReminderAt(dueAt, reminderOffsetMinutes);

    const info = db
      .prepare(
        `INSERT INTO tasks
          (project_id, epic_id, title, description, priority, status,
           estimate_minutes, due_at, reminder_offset_minutes, reminder_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        projectId,
        epicId,
        title,
        description,
        priority,
        status,
        estimateMinutes,
        dueAt,
        reminderOffsetMinutes,
        reminderAt
      );

    const task = db
      .prepare("SELECT * FROM tasks WHERE id = ?")
      .get(info.lastInsertRowid as number);
    return NextResponse.json({ task }, { status: 201 });
  });
}
