import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const { searchParams } = new URL(req.url);
    const projectIdsRaw = searchParams.get("projectId");
    const projectIds = projectIdsRaw
      ? projectIdsRaw
          .split(",")
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isInteger(n) && n > 0)
      : null;

    const where = projectIds && projectIds.length ? `WHERE e.project_id IN (${projectIds.map(() => "?").join(",")})` : "";
    const epics = db
      .prepare(
        `SELECT e.*, p.name AS project_name
         FROM epics e
         JOIN projects p ON p.id = e.project_id
         ${where}
         ORDER BY p.name COLLATE NOCASE ASC, e.name COLLATE NOCASE ASC`
      )
      .all(...(projectIds ?? []));
    return NextResponse.json({ epics });
  });
}
