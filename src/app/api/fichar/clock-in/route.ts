import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ApiError, handle } from "@/lib/api-helpers";
import { localDate } from "@/lib/fichar";
import { pressInstant } from "@/lib/fichar-api";
import { closeStaleSessions, getOpenSession, getSessionById } from "@/lib/fichar-db";

export async function POST(req: NextRequest) {
  return handle(async () => {
    closeStaleSessions();
    if (getOpenSession()) throw new ApiError(400, "Ya tienes una jornada abierta");

    const startedAt = await pressInstant(req);
    const info = db
      .prepare("INSERT INTO work_sessions (started_at, local_date) VALUES (?, ?)")
      .run(startedAt, localDate(startedAt));

    return NextResponse.json({ session: getSessionById(info.lastInsertRowid as number) }, { status: 201 });
  });
}
