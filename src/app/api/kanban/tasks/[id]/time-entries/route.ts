import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ApiError, handle, optionalString, parseIdParam } from "@/lib/api-helpers";
import type { Task, TimeEntry } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const taskId = parseIdParam((await ctx.params).id);
    const entries = db
      .prepare<[number], TimeEntry>(
        "SELECT * FROM time_entries WHERE task_id = ? ORDER BY logged_on DESC, id DESC"
      )
      .all(taskId);
    return NextResponse.json({ timeEntries: entries });
  });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const taskId = parseIdParam((await ctx.params).id);
    const task = db.prepare<[number], Task>("SELECT * FROM tasks WHERE id = ?").get(taskId);
    if (!task) throw new ApiError(404, "Tarea no encontrada");

    const body = await req.json();
    const minutesRaw = body.minutes;
    const minutes = typeof minutesRaw === "number" ? minutesRaw : Number(minutesRaw);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      throw new ApiError(400, 'El campo "minutes" debe ser un número mayor que 0');
    }
    const note = optionalString(body, "note") || "";
    const loggedOn =
      optionalString(body, "logged_on") || new Date().toISOString().slice(0, 10);

    const info = db
      .prepare(
        "INSERT INTO time_entries (task_id, minutes, note, logged_on) VALUES (?, ?, ?, ?)"
      )
      .run(taskId, Math.round(minutes), note, loggedOn);

    const entry = db
      .prepare<[number], TimeEntry>("SELECT * FROM time_entries WHERE id = ?")
      .get(info.lastInsertRowid as number);
    return NextResponse.json({ timeEntry: entry }, { status: 201 });
  });
}
