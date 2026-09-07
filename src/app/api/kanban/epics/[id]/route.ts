import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ApiError, handle, optionalString, parseIdParam } from "@/lib/api-helpers";
import type { Epic } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const id = parseIdParam((await ctx.params).id);
    const existing = db.prepare<[number], Epic>("SELECT * FROM epics WHERE id = ?").get(id);
    if (!existing) throw new ApiError(404, "Épica no encontrada");
    const body = await req.json();
    const name = optionalString(body, "name");
    const color = optionalString(body, "color");
    if (name !== undefined) {
      if (!name.trim()) throw new ApiError(400, 'El campo "name" no puede estar vacío');
      db.prepare("UPDATE epics SET name = ? WHERE id = ?").run(name.trim(), id);
    }
    if (color !== undefined) {
      db.prepare("UPDATE epics SET color = ? WHERE id = ?").run(color, id);
    }
    const epic = db.prepare<[number], Epic>("SELECT * FROM epics WHERE id = ?").get(id);
    return NextResponse.json({ epic });
  });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const id = parseIdParam((await ctx.params).id);
    const existing = db.prepare<[number], Epic>("SELECT * FROM epics WHERE id = ?").get(id);
    if (!existing) throw new ApiError(404, "Épica no encontrada");
    db.prepare("DELETE FROM epics WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  });
}
