import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ApiError, handle, optionalString, parseIdParam } from "@/lib/api-helpers";
import { localDate } from "@/lib/fichar";
import { assertNoSessionOverlap, assertOrder, parseInstant } from "@/lib/fichar-api";
import { closeStaleSessions, getSessionById } from "@/lib/fichar-db";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    closeStaleSessions();
    const id = parseIdParam((await ctx.params).id);
    const existing = getSessionById(id);
    if (!existing) throw new ApiError(404, "Jornada no encontrada");

    const body = await req.json();
    const rawStart = optionalString(body, "started_at");
    const rawEnd = optionalString(body, "ended_at");

    const startedAt = rawStart === undefined ? existing.started_at : parseInstant(rawStart);
    const endedAt = rawEnd === undefined ? existing.ended_at : parseInstant(rawEnd);

    assertOrder(startedAt, endedAt, "La salida debe ser posterior a la entrada");
    assertNoSessionOverlap(id, startedAt, endedAt);

    // Every break has to still fit inside the edited session.
    const sStart = Date.parse(startedAt);
    const sEnd = endedAt ? Date.parse(endedAt) : Number.POSITIVE_INFINITY;
    for (const b of existing.breaks) {
      const bStart = Date.parse(b.started_at);
      const bEnd = b.ended_at ? Date.parse(b.ended_at) : Number.POSITIVE_INFINITY;
      if (bStart < sStart || bEnd > sEnd) {
        throw new ApiError(400, "Algún descanso quedaría fuera de la jornada");
      }
    }

    // Correcting the end time is exactly the review the auto-close banner asks
    // for, so it clears the flag rather than needing a separate "seen" action.
    const autoClosed = rawEnd !== undefined ? 0 : existing.auto_closed;

    db.prepare(
      `UPDATE work_sessions
       SET started_at = ?, ended_at = ?, local_date = ?, auto_closed = ?, updated_at = ?
       WHERE id = ?`
    ).run(startedAt, endedAt, localDate(startedAt), autoClosed, new Date().toISOString(), id);

    return NextResponse.json({ session: getSessionById(id) });
  });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const id = parseIdParam((await ctx.params).id);
    if (!getSessionById(id)) throw new ApiError(404, "Jornada no encontrada");
    // Breaks go with it via ON DELETE CASCADE (foreign_keys is ON in db.ts).
    db.prepare("DELETE FROM work_sessions WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  });
}
