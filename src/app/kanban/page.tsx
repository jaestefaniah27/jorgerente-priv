import { db } from "@/lib/db";
import type { Project, TaskWithExtras } from "@/lib/types";
import GlobalView from "./GlobalView";

// This page reads live data from SQLite on every request; it must never be
// statically prerendered (the board changes constantly).
export const dynamic = "force-dynamic";

export default async function KanbanHome() {
  const projects = db
    .prepare<[], Project>("SELECT * FROM projects ORDER BY name COLLATE NOCASE ASC")
    .all();

  const tasks = db
    .prepare<[], TaskWithExtras>(
      `SELECT t.*,
              p.name AS project_name, p.color AS project_color,
              e.name AS epic_name, e.color AS epic_color,
              COALESCE(SUM(te.minutes), 0) AS time_spent_minutes
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       LEFT JOIN epics e ON e.id = t.epic_id
       LEFT JOIN time_entries te ON te.task_id = t.id
       GROUP BY t.id
       ORDER BY t.created_at DESC`
    )
    .all();

  return <GlobalView initialProjects={projects} initialTasks={tasks} />;
}
