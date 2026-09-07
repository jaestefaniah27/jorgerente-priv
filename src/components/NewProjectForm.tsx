"use client";

import { useState } from "react";
import type { Project } from "@/lib/types";
import { emitProjectsChanged } from "@/lib/events";

const COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

export default function NewProjectForm({ onCreated }: { onCreated: (project: Project) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/kanban/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), color }),
      });
      const data = await res.json();
      if (res.ok) {
        onCreated(data.project);
        emitProjectsChanged();
        setName("");
        setOpen(false);
      }
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
        + Nuevo proyecto
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
      <input
        autoFocus
        className="rounded border border-slate-300 px-2 py-1 text-sm"
        placeholder="Nombre del proyecto"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <div className="flex gap-1">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className={`h-5 w-5 rounded-full ${color === c ? "ring-2 ring-offset-1 ring-slate-500" : ""}`}
            style={{ backgroundColor: c }}
            aria-label={c}
          />
        ))}
      </div>
      <button onClick={submit} disabled={saving} className="rounded bg-indigo-600 px-3 py-1 text-sm text-white">
        Crear
      </button>
      <button onClick={() => setOpen(false)} className="text-sm text-slate-500">
        Cancelar
      </button>
    </div>
  );
}
