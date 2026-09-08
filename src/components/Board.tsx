"use client";

import { useMemo, useState } from "react";
import type { Epic, Project, Status, TaskWithExtras } from "@/lib/types";
import { STATUSES, STATUS_COLUMNS, STATUS_LABELS } from "@/lib/types";
import TaskCard from "./TaskCard";
import TaskDetailModal from "./TaskDetailModal";
import NewTaskModal from "./NewTaskModal";

export default function Board({
  project,
  initialEpics,
  initialTasks,
}: {
  project: Project;
  initialEpics: Epic[];
  initialTasks: TaskWithExtras[];
}) {
  const [tasks, setTasks] = useState<TaskWithExtras[]>(initialTasks);
  const [epics, setEpics] = useState<Epic[]>(initialEpics);
  const [openTask, setOpenTask] = useState<TaskWithExtras | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [showEpicForm, setShowEpicForm] = useState(false);
  const [newEpicName, setNewEpicName] = useState("");

  const columns = useMemo(() => {
    const map: Record<Status, TaskWithExtras[]> = { backlog: [], todo: [], in_progress: [], done: [] };
    for (const t of tasks) map[t.status].push(t);
    return map;
  }, [tasks]);

  async function moveTask(task: TaskWithExtras, direction: -1 | 1) {
    const idx = STATUSES.indexOf(task.status);
    const nextStatus = STATUSES[idx + direction];
    if (!nextStatus) return;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)));
    await fetch(`/api/kanban/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
  }

  async function dropOn(status: Status) {
    if (draggedId == null) return;
    const task = tasks.find((t) => t.id === draggedId);
    setDraggedId(null);
    if (!task || task.status === status) return;
    setTasks((prev) => prev.map((t) => (t.id === draggedId ? { ...t, status } : t)));
    await fetch(`/api/kanban/tasks/${draggedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  async function addEpic() {
    const name = newEpicName.trim();
    if (!name) return;
    const res = await fetch(`/api/kanban/projects/${project.id}/epics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (res.ok) {
      setEpics((prev) => [...prev, data.epic]);
      setNewEpicName("");
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
          <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: project.color }} />
          {project.name}
        </h1>
        <button
          onClick={() => setShowEpicForm((v) => !v)}
          className="text-sm text-indigo-700 hover:underline"
        >
          Épicas ({epics.length})
        </button>
      </div>

      {showEpicForm && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-2 flex flex-wrap gap-2">
            {epics.map((e) => (
              <span
                key={e.id}
                className="rounded px-2 py-1 text-xs"
                style={{ backgroundColor: `${e.color}33`, color: e.color }}
              >
                {e.name}
              </span>
            ))}
            {epics.length === 0 && <span className="text-xs text-slate-400">Sin épicas todavía.</span>}
          </div>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
              placeholder="Nombre de la nueva épica"
              value={newEpicName}
              onChange={(e) => setNewEpicName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addEpic()}
            />
            <button onClick={addEpic} className="rounded bg-slate-800 px-3 py-1 text-sm text-white">
              Añadir
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STATUS_COLUMNS.map((status) => (
          <div
            key={status}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => dropOn(status)}
            className="rounded-lg bg-slate-100 p-3"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                {STATUS_LABELS[status]}
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">{columns[status].length}</span>
                {status === "backlog" && (
                  <button
                    type="button"
                    onClick={() => setShowNewTask(true)}
                    className="rounded bg-slate-800 px-2 py-0.5 text-sm text-white hover:bg-slate-700"
                    aria-label="Nueva tarea"
                    title="Nueva tarea"
                  >
                    +
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {columns[status].map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onOpen={setOpenTask}
                  onMove={moveTask}
                  draggable
                  onDragStart={(t) => setDraggedId(t.id)}
                />
              ))}
              {columns[status].length === 0 && (
                <p className="text-xs text-slate-400">Sin tareas.</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {showNewTask && (
        <NewTaskModal
          projects={[project]}
          epics={epics}
          defaultProjectId={project.id}
          lockProject
          onClose={() => setShowNewTask(false)}
          onCreated={(task) => setTasks((prev) => [task, ...prev])}
        />
      )}

      {openTask && (
        <TaskDetailModal
          task={openTask}
          epics={epics}
          onClose={() => setOpenTask(null)}
          onUpdated={(updated) => {
            setTasks((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
            setOpenTask((prev) => (prev ? { ...prev, ...updated } : prev));
          }}
          onDeleted={(id) => {
            setTasks((prev) => prev.filter((t) => t.id !== id));
            setOpenTask(null);
          }}
        />
      )}
    </div>
  );
}
