"use client";

import { useCallback, useEffect, useState } from "react";
import { msToShort } from "@/lib/format";
import {
  addDays,
  mondayOf,
  todayLocal,
  totalsForSessions,
  type WeekDay,
  type WorkBreak,
  type WorkSession,
} from "@/lib/fichar";

// <input type="datetime-local"> speaks local wall-clock time with no zone, so
// these convert against the browser's own zone — which is Jorge's.
function toInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

function fromInputValue(value: string): string | null {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function clockOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function rangeLabel(start: string, end: string): string {
  const fmt = (d: string) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  return `${fmt(start)} – ${fmt(end)}`;
}

async function fetchWeek(start: string): Promise<WeekDay[]> {
  const res = await fetch(`/api/fichar/week?start=${start}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.days as WeekDay[];
}

export default function HistoryModal({
  initialWeekStart,
  onClose,
}: {
  initialWeekStart: string;
  onClose: () => void;
}) {
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [days, setDays] = useState<WeekDay[] | null>(null);
  const [editing, setEditing] = useState<{ kind: "session" | "break"; id: number } | null>(null);
  const [draft, setDraft] = useState<{ started_at: string; ended_at: string }>({
    started_at: "",
    ended_at: "",
  });
  const [rowError, setRowError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // A session still running has to keep ticking here too.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchWeek(weekStart)
      .then((d) => {
        if (!cancelled) setDays(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [weekStart]);

  const reload = useCallback(async () => {
    setDays(await fetchWeek(weekStart));
  }, [weekStart]);

  const isCurrentWeek = weekStart === mondayOf(todayLocal());
  const weekTotals = totalsForSessions(
    (days ?? []).flatMap((d) => d.sessions),
    now
  );

  function startEditSession(s: WorkSession) {
    setEditing({ kind: "session", id: s.id });
    setRowError(null);
    setDraft({
      started_at: toInputValue(s.started_at),
      ended_at: s.ended_at ? toInputValue(s.ended_at) : "",
    });
  }

  function startEditBreak(b: WorkBreak) {
    setEditing({ kind: "break", id: b.id });
    setRowError(null);
    setDraft({
      started_at: toInputValue(b.started_at),
      ended_at: b.ended_at ? toInputValue(b.ended_at) : "",
    });
  }

  async function save() {
    if (!editing) return;
    const started = fromInputValue(draft.started_at);
    if (!started) {
      setRowError("Fecha de inicio inválida");
      return;
    }
    const body: Record<string, string> = { started_at: started };
    if (draft.ended_at) {
      const ended = fromInputValue(draft.ended_at);
      if (!ended) {
        setRowError("Fecha de fin inválida");
        return;
      }
      body.ended_at = ended;
    }

    setSaving(true);
    setRowError(null);
    const path = editing.kind === "session" ? "sessions" : "breaks";
    const res = await fetch(`/api/fichar/${path}/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setRowError(data.error || "No se pudo guardar");
      return;
    }
    setEditing(null);
    await reload();
  }

  async function remove() {
    if (!editing) return;
    setSaving(true);
    const path = editing.kind === "session" ? "sessions" : "breaks";
    const res = await fetch(`/api/fichar/${path}/${editing.id}`, { method: "DELETE" });
    setSaving(false);
    if (!res.ok) {
      setRowError("No se pudo borrar");
      return;
    }
    setEditing(null);
    await reload();
  }

  const editor = (
    <div className="mt-2 rounded-lg border border-slate-300 bg-slate-50 p-3">
      <div className="flex flex-wrap gap-3">
        <label className="text-xs text-slate-600">
          Inicio
          <input
            type="datetime-local"
            className="mt-1 block rounded border border-slate-300 px-2 py-1 text-sm"
            value={draft.started_at}
            onChange={(e) => setDraft((d) => ({ ...d, started_at: e.target.value }))}
          />
        </label>
        <label className="text-xs text-slate-600">
          Fin
          <input
            type="datetime-local"
            className="mt-1 block rounded border border-slate-300 px-2 py-1 text-sm"
            value={draft.ended_at}
            onChange={(e) => setDraft((d) => ({ ...d, ended_at: e.target.value }))}
          />
        </label>
      </div>
      {rowError && <p className="mt-2 text-xs text-rose-600">{rowError}</p>}
      <div className="mt-3 flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          Guardar
        </button>
        <button
          onClick={() => setEditing(null)}
          className="rounded border border-slate-300 px-3 py-1 text-xs"
        >
          Cancelar
        </button>
        <button
          onClick={remove}
          disabled={saving}
          className="ml-auto rounded border border-rose-300 px-3 py-1 text-xs text-rose-700 disabled:opacity-50"
        >
          Borrar
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-3 sm:p-8">
      <div className="mx-auto w-full max-w-2xl rounded-xl bg-white p-4 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Historial</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="mb-4 flex items-center justify-between gap-2">
          <button
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            className="rounded border border-slate-300 px-2.5 py-1 text-sm hover:bg-slate-50"
            aria-label="Semana anterior"
          >
            ‹
          </button>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-800">
              {rangeLabel(weekStart, addDays(weekStart, 6))}
            </p>
            {!isCurrentWeek && (
              <button
                onClick={() => setWeekStart(mondayOf(todayLocal()))}
                className="text-xs text-indigo-700 hover:underline"
              >
                Esta semana
              </button>
            )}
          </div>
          <button
            onClick={() => setWeekStart((w) => addDays(w, 7))}
            disabled={isCurrentWeek}
            className="rounded border border-slate-300 px-2.5 py-1 text-sm hover:bg-slate-50 disabled:opacity-40"
            aria-label="Semana siguiente"
          >
            ›
          </button>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2 text-center">
          {[
            ["Oficina", weekTotals.officeMs],
            ["Descanso", weekTotals.breakMs],
            ["Efectivo", weekTotals.effectiveMs],
          ].map(([label, ms]) => (
            <div key={label as string} className="rounded-lg bg-slate-100 px-2 py-2">
              <span className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                {label as string}
              </span>
              <span className="mt-0.5 block text-sm font-semibold tabular-nums text-slate-800">
                {msToShort(ms as number)}
              </span>
            </div>
          ))}
        </div>

        {days === null ? (
          <p className="py-6 text-center text-sm text-slate-400">Cargando…</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {days.map((day) => {
              const totals = totalsForSessions(day.sessions, now);
              return (
                <li key={day.date} className="py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium capitalize text-slate-700">
                      {dayLabel(day.date)}
                    </span>
                    {day.sessions.length === 0 ? (
                      <span className="text-xs text-slate-300">—</span>
                    ) : (
                      <span className="text-xs tabular-nums text-slate-500">
                        {msToShort(totals.officeMs)} · {msToShort(totals.breakMs)} descanso ·{" "}
                        <strong className="text-slate-700">{msToShort(totals.effectiveMs)}</strong>{" "}
                        efectivo
                      </span>
                    )}
                  </div>

                  {day.sessions.map((s) => (
                    <div key={s.id} className="mt-2 rounded-lg bg-slate-50 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm tabular-nums text-slate-700">
                          {clockOf(s.started_at)} → {s.ended_at ? clockOf(s.ended_at) : "en curso"}
                        </span>
                        <div className="flex items-center gap-2">
                          {s.auto_closed === 1 && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                              cerrada automáticamente
                            </span>
                          )}
                          <button
                            onClick={() => startEditSession(s)}
                            className="text-xs text-indigo-700 hover:underline"
                          >
                            Editar
                          </button>
                        </div>
                      </div>

                      {s.breaks.map((b) => (
                        <div
                          key={b.id}
                          className="mt-1 flex items-center justify-between gap-2 pl-3 text-xs text-slate-500"
                        >
                          <span className="tabular-nums">
                            descanso {clockOf(b.started_at)} →{" "}
                            {b.ended_at ? clockOf(b.ended_at) : "en curso"}
                          </span>
                          <button
                            onClick={() => startEditBreak(b)}
                            className="text-indigo-700 hover:underline"
                          >
                            Editar
                          </button>
                        </div>
                      ))}

                      {editing?.kind === "session" && editing.id === s.id && editor}
                      {editing?.kind === "break" &&
                        s.breaks.some((b) => b.id === editing.id) &&
                        editor}
                    </div>
                  ))}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
