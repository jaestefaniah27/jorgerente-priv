import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ApiError, handle, parseIdParam } from "@/lib/api-helpers";
import type { TimeEntry } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const id = parseIdParam((await ctx.params).id);
    const existing = db
      .prepare<[number], TimeEntry>("SELECT * FROM time_entries WHERE id = ?")
      .get(id);
    if (!existing) throw new ApiError(404, "Registro de tiempo no encontrado");
    db.prepare("DELETE FROM time_entries WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  });
}
