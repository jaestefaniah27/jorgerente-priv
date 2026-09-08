"use client";

import { useState } from "react";
import type { Project, TaskWithExtras } from "@/lib/types";

// Standalone "create a task" form that requires picking a project first —
// used by the global view, which (unlike a project board) has no single
// implicit project to attach a quick-add task to.
export default function NewTaskForm({
  projects,
  onCreated,
}: {
  projects: Project[];
  onCreated: (task: TaskWithExtras) => void;
}) {
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState<string>(projects[0] ? String(projects[0].id) : "");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!projectId || !title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/kanban/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: Number(projectId), title: title.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al crear la tarea");
        return;
      }
      const project = projects.find((p) => p.id === Number(projectId));
      onCreated({
        ...data.task,
        project_name: project?.name ?? "",
        project_color: project?.color ?? "#6366f1",
        epic_name: null,
        epic_color: null,
        time_spent_minutes: 0,
      });
      setTitle("");
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
      >
        + Nueva tarea
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
      <select
        className="rounded border border-slate-300 px-2 py-1 text-sm"
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <input
        autoFocus
        className="rounded border border-slate-300 px-2 py-1 text-sm"
        placeholder="Título de la tarea"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <button
        onClick={submit}
        disabled={saving || !title.trim()}
        className="rounded bg-indigo-600 px-3 py-1 text-sm text-white disabled:opacity-50"
      >
        Crear
      </button>
      <button onClick={() => setOpen(false)} className="text-sm text-slate-500">
        Cancelar
      </button>
      {error && <p className="w-full text-xs text-rose-600">{error}</p>}
    </div>
  );
}
