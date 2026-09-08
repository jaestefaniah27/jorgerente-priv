"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Epic, Priority, Project, Status, TaskWithExtras } from "@/lib/types";
import { PRIORITIES, PRIORITY_LABELS, STATUSES, STATUS_LABELS } from "@/lib/types";
import TaskCard from "@/components/TaskCard";
import TaskDetailModal from "@/components/TaskDetailModal";
import NewProjectForm from "@/components/NewProjectForm";
import NewTaskForm from "@/components/NewTaskForm";

type EpicWithProject = Epic & { project_name: string };

export default function GlobalView({
  initialProjects,
  initialTasks,
}: {
  initialProjects: Project[];
  initialTasks: TaskWithExtras[];
}) {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [tasks, setTasks] = useState<TaskWithExtras[]>(initialTasks);
  const [allEpics, setAllEpics] = useState<EpicWithProject[]>([]);
  const [openTask, setOpenTask] = useState<TaskWithExtras | null>(null);

  const [selectedProjects, setSelectedProjects] = useState<number[]>([]);
  const [selectedEpic, setSelectedEpic] = useState<string>("");
  const [priority, setPriority] = useState<string>("");

  useEffect(() => {
    fetch("/api/kanban/epics")
      .then((r) => r.json())
      .then((d) => setAllEpics(d.epics ?? []));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedProjects.length) params.set("projectId", selectedProjects.join(","));
    if (selectedEpic) params.set("epicId", selectedEpic);
    if (priority) params.set("priority", priority);
    fetch(`/api/kanban/tasks?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setTasks(d.tasks ?? []));
  }, [selectedProjects, selectedEpic, priority]);

  const visibleEpics = useMemo(
    () =>
      selectedProjects.length
        ? allEpics.filter((e) => selectedProjects.includes(e.project_id))
        : allEpics,
    [allEpics, selectedProjects]
  );

  const columns = useMemo(() => {
    const map: Record<Status, TaskWithExtras[]> = { todo: [], in_progress: [], done: [] };
    for (const t of tasks) map[t.status].push(t);
    return map;
  }, [tasks]);

  function toggleProject(id: number) {
    setSelectedProjects((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

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

  const epicsForModal = openTask ? allEpics.filter((e) => e.project_id === openTask.project_id) : [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Vista global</h1>
        <div className="flex flex-wrap gap-2">
          {projects.length > 0 && (
            <NewTaskForm
              projects={projects}
              onCreated={(t: TaskWithExtras) => setTasks((prev) => [t, ...prev])}
            />
          )}
          <NewProjectForm onCreated={(p) => setProjects((prev) => [...prev, p])} />
        </div>
      </div>

      {projects.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          Todavía no tienes ningún proyecto. Crea el primero para empezar a añadir tareas.
        </p>
      ) : (
        <>
          <div className="mb-4">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
              Tus tableros
            </p>
            <div className="flex flex-wrap gap-1.5">
              {projects.map((p) => (
                <Link
                  key={p.id}
                  href={`/kanban/board/${p.id}`}
                  className="flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:border-indigo-300 hover:text-indigo-700"
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  {p.name}
                  <span aria-hidden className="text-slate-400">
                    →
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <span className="text-xs text-slate-400">Filtrar por proyecto:</span>
            <div className="flex flex-wrap gap-1.5">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => toggleProject(p.id)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    selectedProjects.includes(p.id)
                      ? "border-transparent text-white"
                      : "border-slate-300 text-slate-600"
                  }`}
                  style={selectedProjects.includes(p.id) ? { backgroundColor: p.color } : undefined}
                >
                  {p.name}
                </button>
              ))}
            </div>

            <select
              className="rounded border border-slate-300 px-2 py-1 text-xs"
              value={selectedEpic}
              onChange={(e) => setSelectedEpic(e.target.value)}
            >
              <option value="">Todas las épicas</option>
              {visibleEpics.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.project_name} · {e.name}
                </option>
              ))}
            </select>

            <select
              className="rounded border border-slate-300 px-2 py-1 text-xs"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="">Cualquier prioridad</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p as Priority]}
                </option>
              ))}
            </select>

            {(selectedProjects.length > 0 || selectedEpic || priority) && (
              <button
                onClick={() => {
                  setSelectedProjects([]);
                  setSelectedEpic("");
                  setPriority("");
                }}
                className="text-xs text-slate-400 hover:text-slate-700"
              >
                Limpiar filtros
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {STATUSES.map((status) => (
              <div key={status} className="rounded-lg bg-slate-100 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                    {STATUS_LABELS[status]}
                  </h2>
                  <span className="text-xs text-slate-400">{columns[status].length}</span>
                </div>
                <div className="space-y-2">
                  {columns[status].map((task) => (
                    <TaskCard key={task.id} task={task} onOpen={setOpenTask} onMove={moveTask} showProject />
                  ))}
                  {columns[status].length === 0 && (
                    <p className="text-xs text-slate-400">Sin tareas.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {openTask && (
        <TaskDetailModal
          task={openTask}
          epics={epicsForModal}
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
