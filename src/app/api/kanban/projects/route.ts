import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle, requireString, optionalString } from "@/lib/api-helpers";
import type { Project } from "@/lib/types";

export async function GET() {
  return handle(async () => {
    const projects = db
      .prepare<[], Project>("SELECT * FROM projects ORDER BY name COLLATE NOCASE ASC")
      .all();
    return NextResponse.json({ projects });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json();
    const name = requireString(body, "name");
    const color = optionalString(body, "color") || "#6366f1";
    const info = db
      .prepare("INSERT INTO projects (name, color) VALUES (?, ?)")
      .run(name, color);
    const project = db
      .prepare<[number], Project>("SELECT * FROM projects WHERE id = ?")
      .get(info.lastInsertRowid as number);
    return NextResponse.json({ project }, { status: 201 });
  });
}
