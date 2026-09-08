import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ApiError, handle } from "@/lib/api-helpers";
import { notBefore, pressInstant } from "@/lib/fichar-api";
import { closeStaleSessions, getBreakById, getOpenBreak, getOpenSession } from "@/lib/fichar-db";

export async function POST(req: NextRequest) {
  return handle(async () => {
    closeStaleSessions();
    const open = getOpenSession();
    if (!open) throw new ApiError(400, "No tienes ninguna jornada abierta");
    const current = getOpenBreak(open.id);
    if (!current) throw new ApiError(400, "No tienes ningún descanso en curso");

    const endedAt = notBefore(await pressInstant(req), current.started_at);
    db.prepare("UPDATE work_breaks SET ended_at = ?, updated_at = ? WHERE id = ?").run(
      endedAt,
      new Date().toISOString(),
      current.id
    );

    return NextResponse.json({ break: getBreakById(current.id) });
  });
}
