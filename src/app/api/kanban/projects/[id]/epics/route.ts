import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ApiError, handle, optionalString, parseIdParam, requireString } from "@/lib/api-helpers";
import type { Epic, Project } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const projectId = parseIdParam((await ctx.params).id);
    const epics = db
      .prepare<[number], Epic>("SELECT * FROM epics WHERE project_id = ? ORDER BY name COLLATE NOCASE ASC")
      .all(projectId);
    return NextResponse.json({ epics });
  });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const projectId = parseIdParam((await ctx.params).id);
    const project = db.prepare<[number], Project>("SELECT * FROM projects WHERE id = ?").get(projectId);
    if (!project) throw new ApiError(404, "Proyecto no encontrado");

    const body = await req.json();
    const name = requireString(body, "name");
    const color = optionalString(body, "color") || "#f59e0b";
    const info = db
      .prepare("INSERT INTO epics (project_id, name, color) VALUES (?, ?, ?)")
      .run(projectId, name, color);
    const epic = db
      .prepare<[number], Epic>("SELECT * FROM epics WHERE id = ?")
      .get(info.lastInsertRowid as number);
    return NextResponse.json({ epic }, { status: 201 });
  });
}
