import { NextResponse } from "next/server";
import { handle } from "@/lib/api-helpers";
import { buildClockState, closeStaleSessions } from "@/lib/fichar-db";

export async function GET() {
  return handle(async () => {
    closeStaleSessions();
    return NextResponse.json(buildClockState());
  });
}
