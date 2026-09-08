"use client";

import { useMemo, useState } from "react";
import type { Epic, Priority, Project, TaskWithExtras } from "@/lib/types";
import { PRIORITIES, PRIORITY_LABELS, REMINDER_OFFSETS } from "@/lib/types";

type EpicWithProject = Epic & { project_id: number };

// Full task-creation form, opened as a modal from either a project board
// (project locked to that board) or the global view (project pickable).
// Mirrors most of TaskDetailModal's fields so a task can be fully specified
// up front — title, estimate, due date + reminder, epic, priority — plus
// the one creation-only choice: whether it starts in the Backlog (default)
// or goes straight to To Do.
export default function NewTaskModal({
  projects,
  epics,
  defaultProjectId,
  lockProject = false,
  onCreated,
  onClose,
}: {
  projects: Project[];
  epics: EpicWithProject[];
  defaultProjectId?: number;
  lockProject?: boolean;
  onCreated: (task: TaskWithExtras) => void;
  onClose: () => void;
}) {
  const [projectId, setProjectId] = useState<string>(
    defaultProjectId != null ? String(defaultProjectId) : projects[0] ? String(projects[0].id) : ""
  );
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [epicId, setEpicId] = useState<string>("");
  const [estimateHours, setEstimateHours] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [reminderOffset, setReminderOffset] = useState<string>("");
  const [sendToTodo, setSendToTodo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const epicsForProject = useMemo(
    () => epics.filter((e) => e.project_id === Number(projectId)),
    [epics, projectId]
  );

  async function submit() {
    if (!projectId || !title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        project_id: Number(projectId),
        title: title.trim(),
        priority,
        epic_id: epicId ? Number(epicId) : null,
        estimate_minutes: estimateHours.trim() === "" ? null : Math.round(Number(estimateHours) * 60),
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        reminder_offset_minutes: dueAt && reminderOffset !== "" ? Number(reminderOffset) : null,
        status: sendToTodo ? "todo" : "backlog",
      };
      const res = await fetch("/api/kanban/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al crear la tarea");
        return;
      }
      const project = projects.find((p) => p.id === Number(projectId));
      const epic = epicsForProject.find((e) => e.id === Number(epicId));
      onCreated({
        ...data.task,
        project_name: project?.name ?? "",
        project_color: project?.color ?? "#6366f1",
        epic_name: epic?.name ?? null,
        epic_color: epic?.color ?? null,
        time_spent_minutes: 0,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Nueva tarea</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Cerrar">
            ✕
          </button>
        </div>

        {error && <p className="mb-3 rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2 text-sm">
            Título
            <input
              autoFocus
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </label>

          {!lockProject && (
            <label className="text-sm">
              Proyecto
              <select
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setEpicId("");
                }}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="text-sm">
            Prioridad
            <select
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            Épica
            <select
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
              value={epicId}
              onChange={(e) => setEpicId(e.target.value)}
            >
              <option value="">Sin épica</option>
              {epicsForProject.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            Estimación (horas)
            <input
              type="number"
              min="0"
              step="0.5"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
              value={estimateHours}
              onChange={(e) => setEstimateHours(e.target.value)}
            />
          </label>

          <label className="text-sm">
            Fecha límite (opcional)
            <input
              type="datetime-local"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
              value={dueAt}
              onChange={(e) => {
                setDueAt(e.target.value);
                if (!e.target.value) setReminderOffset("");
              }}
            />
          </label>

          <label className="text-sm">
            Aviso
            <select
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 disabled:bg-slate-100"
              value={reminderOffset}
              disabled={!dueAt}
              onChange={(e) => setReminderOffset(e.target.value)}
            >
              <option value="">Sin aviso</option>
              {REMINDER_OFFSETS.map((o) => (
                <option key={o.minutes} value={o.minutes}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="sm:col-span-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={sendToTodo}
              onChange={(e) => setSendToTodo(e.target.checked)}
            />
            Enviar directamente a To Do (si no, se crea en Backlog)
          </label>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-slate-300 px-3 py-1.5 text-sm">
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={saving || !title.trim() || !projectId}
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Creando…" : "Crear tarea"}
          </button>
        </div>
      </div>
    </div>
  );
}
