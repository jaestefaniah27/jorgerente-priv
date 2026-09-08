import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ApiError, handle, optionalString, parseIdParam } from "@/lib/api-helpers";
import { assertBreakFits, assertOrder, parseInstant } from "@/lib/fichar-api";
import { closeStaleSessions, getBreakById, getSessionById } from "@/lib/fichar-db";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    closeStaleSessions();
    const id = parseIdParam((await ctx.params).id);
    const existing = getBreakById(id);
    if (!existing) throw new ApiError(404, "Descanso no encontrado");
    const session = getSessionById(existing.session_id);
    if (!session) throw new ApiError(404, "Jornada no encontrada");

    const body = await req.json();
    const rawStart = optionalString(body, "started_at");
    const rawEnd = optionalString(body, "ended_at");

    const startedAt = rawStart === undefined ? existing.started_at : parseInstant(rawStart);
    const endedAt = rawEnd === undefined ? existing.ended_at : parseInstant(rawEnd);

    assertOrder(startedAt, endedAt, "El fin del descanso debe ser posterior a su inicio");
    assertBreakFits(id, session, startedAt, endedAt);

    db.prepare("UPDATE work_breaks SET started_at = ?, ended_at = ?, updated_at = ? WHERE id = ?").run(
      startedAt,
      endedAt,
      new Date().toISOString(),
      id
    );

    return NextResponse.json({ break: getBreakById(id) });
  });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const id = parseIdParam((await ctx.params).id);
    if (!getBreakById(id)) throw new ApiError(404, "Descanso no encontrado");
    db.prepare("DELETE FROM work_breaks WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  });
}
