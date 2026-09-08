import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ApiError, handle } from "@/lib/api-helpers";
import { notBefore, pressInstant } from "@/lib/fichar-api";
import { closeStaleSessions, getOpenSession, getSessionById } from "@/lib/fichar-db";

export async function POST(req: NextRequest) {
  return handle(async () => {
    closeStaleSessions();
    const open = getOpenSession();
    if (!open) throw new ApiError(400, "No tienes ninguna jornada abierta");

    const endedAt = notBefore(await pressInstant(req), open.started_at);
    const now = new Date().toISOString();

    db.transaction(() => {
      db.prepare("UPDATE work_sessions SET ended_at = ?, updated_at = ? WHERE id = ?").run(
        endedAt,
        now,
        open.id
      );
      // A break still running when the day ends is closed at the same instant.
      db.prepare(
        "UPDATE work_breaks SET ended_at = ?, updated_at = ? WHERE session_id = ? AND ended_at IS NULL"
      ).run(endedAt, now, open.id);
    })();

    return NextResponse.json({ session: getSessionById(open.id) });
  });
}
