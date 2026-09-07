import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ApiError, handle, optionalString, parseIdParam } from "@/lib/api-helpers";
import type { Project } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

function getProjectOr404(id: number): Project {
  const project = db.prepare<[number], Project>("SELECT * FROM projects WHERE id = ?").get(id);
  if (!project) throw new ApiError(404, "Proyecto no encontrado");
  return project;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const id = parseIdParam((await ctx.params).id);
    const project = getProjectOr404(id);
    const epics = db
      .prepare("SELECT * FROM epics WHERE project_id = ? ORDER BY name COLLATE NOCASE ASC")
      .all(id);
    return NextResponse.json({ project, epics });
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const id = parseIdParam((await ctx.params).id);
    getProjectOr404(id);
    const body = await req.json();
    const name = optionalString(body, "name");
    const color = optionalString(body, "color");
    if (name !== undefined) {
      if (!name.trim()) throw new ApiError(400, 'El campo "name" no puede estar vacío');
      db.prepare("UPDATE projects SET name = ? WHERE id = ?").run(name.trim(), id);
    }
    if (color !== undefined) {
      db.prepare("UPDATE projects SET color = ? WHERE id = ?").run(color, id);
    }
    const project = getProjectOr404(id);
    return NextResponse.json({ project });
  });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const id = parseIdParam((await ctx.params).id);
    getProjectOr404(id);
    db.prepare("DELETE FROM projects WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  });
}
