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
    if (getOpenBreak(open.id)) throw new ApiError(400, "Ya tienes un descanso en curso");

    const startedAt = notBefore(await pressInstant(req), open.started_at);
    const info = db
      .prepare("INSERT INTO work_breaks (session_id, started_at) VALUES (?, ?)")
      .run(open.id, startedAt);

    return NextResponse.json({ break: getBreakById(info.lastInsertRowid as number) }, { status: 201 });
  });
}
