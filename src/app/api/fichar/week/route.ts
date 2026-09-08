import { NextRequest, NextResponse } from "next/server";
import { ApiError, handle } from "@/lib/api-helpers";
import { addDays, isDateString, isMonday, mondayOf, todayLocal } from "@/lib/fichar";
import { buildWeek, closeStaleSessions } from "@/lib/fichar-db";

export async function GET(req: NextRequest) {
  return handle(async () => {
    closeStaleSessions();
    const raw = new URL(req.url).searchParams.get("start");
    const start = raw ?? mondayOf(todayLocal());

    if (!isDateString(start)) throw new ApiError(400, "start debe ser una fecha YYYY-MM-DD");
    if (!isMonday(start)) throw new ApiError(400, "start debe ser un lunes");

    const { days, totals } = buildWeek(start, Date.now());
    return NextResponse.json({ start, end: addDays(start, 6), days, totals });
  });
}
