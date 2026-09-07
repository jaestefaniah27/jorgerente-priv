"use client";

import { useEffect, useState } from "react";
import type { Epic, Priority, Status, TaskWithExtras, TimeEntry } from "@/lib/types";
import { PRIORITIES, PRIORITY_LABELS, REMINDER_OFFSETS, STATUSES, STATUS_LABELS } from "@/lib/types";
import { minutesToHoursLabel } from "@/lib/format";

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function TaskDetailModal({
  task,
  epics,
  onClose,
  onUpdated,
  onDeleted,
}: {
  task: TaskWithExtras;
  epics: Epic[];
  onClose: () => void;
  onUpdated: (task: TaskWithExtras) => void;
  onDeleted: (taskId: number) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [status, setStatus] = useState<Status>(task.status);
  const [epicId, setEpicId] = useState<string>(task.epic_id ? String(task.epic_id) : "");
  const [estimateHours, setEstimateHours] = useState(
    task.estimate_minutes != null ? String(task.estimate_minutes / 60) : ""
  );
  const [dueAt, setDueAt] = useState(toDatetimeLocal(task.due_at));
  const [reminderOffset, setReminderOffset] = useState<string>(
    task.reminder_offset_minutes != null ? String(task.reminder_offset_minutes) : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [newMinutes, setNewMinutes] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newLoggedOn, setNewLoggedOn] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    fetch(`/api/kanban/tasks/${task.id}/time-entries`)
      .then((r) => r.json())
      .then((d) => setTimeEntries(d.timeEntries ?? []));
  }, [task.id]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        title,
        description,
        priority,
        status,
        epic_id: epicId ? Number(epicId) : null,
        estimate_minutes: estimateHours.trim() === "" ? null : Math.round(Number(estimateHours) * 60),
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        reminder_offset_minutes:
          dueAt && reminderOffset !== "" ? Number(reminderOffset) : null,
      };
      const res = await fetch(`/api/kanban/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar");
      onUpdated({ ...task, ...data.task });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function addTimeEntry() {
    const minutes = Number(newMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setError("Introduce minutos válidos (> 0)");
      return;
    }
    const res = await fetch(`/api/kanban/tasks/${task.id}/time-entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minutes, note: newNote, logged_on: newLoggedOn }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Error al registrar tiempo");
      return;
    }
    setTimeEntries((prev) => [data.timeEntry, ...prev]);
    setNewMinutes("");
    setNewNote("");
    onUpdated({
      ...task,
      time_spent_minutes: task.time_spent_minutes + Math.round(minutes),
    });
  }

  async function deleteTimeEntry(id: number) {
    await fetch(`/api/kanban/time-entries/${id}`, { method: "DELETE" });
    const entry = timeEntries.find((e) => e.id === id);
    setTimeEntries((prev) => prev.filter((e) => e.id !== id));
    if (entry) {
      onUpdated({ ...task, time_spent_minutes: task.time_spent_minutes - entry.minutes });
    }
  }

  async function remove() {
    if (!confirm(`¿Eliminar la tarea "${task.title}"? No se puede deshacer.`)) return;
    await fetch(`/api/kanban/tasks/${task.id}`, { method: "DELETE" });
    onDeleted(task.id);
  }

  const totalLogged = timeEntries.reduce((sum, e) => sum + e.minutes, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Editar tarea</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Cerrar">
            ✕
          </button>
        </div>

        {error && <p className="mb-3 rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2 text-sm">
            Título
            <input
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>

          <label className="sm:col-span-2 text-sm">
            Descripción
            <textarea
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <label className="text-sm">
            Estado
            <select
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
              value={status}
              onChange={(e) => setStatus(e.target.value as Status)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>

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
              {epics.map((e) => (
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
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={remove}
            className="rounded border border-rose-200 px-3 py-1.5 text-sm text-rose-600 hover:bg-rose-50"
          >
            Eliminar tarea
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded border border-slate-300 px-3 py-1.5 text-sm">
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>

        <hr className="my-4 border-slate-200" />

        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-800">
            Tiempo registrado — total {minutesToHoursLabel(totalLogged)}
          </h3>
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <label className="text-xs">
              Fecha
              <input
                type="date"
                className="mt-1 block rounded border border-slate-300 px-2 py-1 text-sm"
                value={newLoggedOn}
                onChange={(e) => setNewLoggedOn(e.target.value)}
              />
            </label>
            <label className="text-xs">
              Minutos
              <input
                type="number"
                min="1"
                className="mt-1 block w-24 rounded border border-slate-300 px-2 py-1 text-sm"
                value={newMinutes}
                onChange={(e) => setNewMinutes(e.target.value)}
              />
            </label>
            <label className="flex-1 text-xs">
              Nota (opcional)
              <input
                className="mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
              />
            </label>
            <button
              onClick={addTimeEntry}
              className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
            >
              Añadir
            </button>
          </div>

          <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
            {timeEntries.length === 0 && <li className="text-slate-400">Sin registros todavía.</li>}
            {timeEntries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between rounded bg-slate-50 px-2 py-1">
                <span>
                  {entry.logged_on} — {minutesToHoursLabel(entry.minutes)}
                  {entry.note ? ` — ${entry.note}` : ""}
                </span>
                <button
                  onClick={() => deleteTimeEntry(entry.id)}
                  className="text-xs text-slate-400 hover:text-rose-600"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
