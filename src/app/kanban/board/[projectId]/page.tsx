import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import type { Epic, Project, TaskWithExtras } from "@/lib/types";
import Board from "@/components/Board";

export const dynamic = "force-dynamic";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const id = Number(projectId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const project = db.prepare<[number], Project>("SELECT * FROM projects WHERE id = ?").get(id);
  if (!project) notFound();

  const epics = db
    .prepare<[number], Epic>("SELECT * FROM epics WHERE project_id = ? ORDER BY name COLLATE NOCASE ASC")
    .all(id);

  const tasks = db
    .prepare<[number], TaskWithExtras>(
      `SELECT t.*,
              p.name AS project_name, p.color AS project_color,
              e.name AS epic_name, e.color AS epic_color,
              COALESCE(SUM(te.minutes), 0) AS time_spent_minutes
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       LEFT JOIN epics e ON e.id = t.epic_id
       LEFT JOIN time_entries te ON te.task_id = t.id
       WHERE t.project_id = ?
       GROUP BY t.id
       ORDER BY t.created_at DESC`
    )
    .all(id);

  return <Board project={project} initialEpics={epics} initialTasks={tasks} />;
}
