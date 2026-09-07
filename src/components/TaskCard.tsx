"use client";

import type { TaskWithExtras } from "@/lib/types";
import { PRIORITY_LABELS, STATUSES, STATUS_LABELS } from "@/lib/types";
import { formatDueDate, isOverdue, minutesToHoursLabel, PRIORITY_COLORS } from "@/lib/format";

export default function TaskCard({
  task,
  onOpen,
  onMove,
  draggable = false,
  onDragStart,
  showProject = false,
}: {
  task: TaskWithExtras;
  onOpen: (task: TaskWithExtras) => void;
  onMove?: (task: TaskWithExtras, direction: -1 | 1) => void;
  draggable?: boolean;
  onDragStart?: (task: TaskWithExtras) => void;
  showProject?: boolean;
}) {
  const statusIndex = STATUSES.indexOf(task.status);
  const overdue = isOverdue(task.due_at, task.status);

  return (
    <div
      draggable={draggable}
      onDragStart={() => onDragStart?.(task)}
      onClick={() => onOpen(task)}
      className="cursor-pointer rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:border-indigo-300 hover:shadow"
      data-task-id={task.id}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-900">{task.title}</p>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${PRIORITY_COLORS[task.priority]}`}>
          {PRIORITY_LABELS[task.priority]}
        </span>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        {showProject && (
          <span
            className="rounded px-1.5 py-0.5 text-white"
            style={{ backgroundColor: task.project_color }}
          >
            {task.project_name}
          </span>
        )}
        {task.epic_name && (
          <span
            className="rounded px-1.5 py-0.5"
            style={{ backgroundColor: `${task.epic_color}33`, color: task.epic_color ?? undefined }}
          >
            {task.epic_name}
          </span>
        )}
        {task.due_at && (
          <span className={overdue ? "font-semibold text-rose-600" : "text-slate-500"}>
            📅 {formatDueDate(task.due_at)}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-500">
        <span>
          ⏱ {minutesToHoursLabel(task.time_spent_minutes)}
          {task.estimate_minutes != null ? ` / ${minutesToHoursLabel(task.estimate_minutes)}` : ""}
        </span>
        {onMove && (
          <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              disabled={statusIndex <= 0}
              onClick={() => onMove(task, -1)}
              className="rounded border border-slate-200 px-1.5 py-0.5 hover:bg-slate-50 disabled:opacity-30"
              title={statusIndex > 0 ? `Mover a ${STATUS_LABELS[STATUSES[statusIndex - 1]]}` : undefined}
            >
              ←
            </button>
            <button
              type="button"
              disabled={statusIndex >= STATUSES.length - 1}
              onClick={() => onMove(task, 1)}
              className="rounded border border-slate-200 px-1.5 py-0.5 hover:bg-slate-50 disabled:opacity-30"
              title={statusIndex < STATUSES.length - 1 ? `Mover a ${STATUS_LABELS[STATUSES[statusIndex + 1]]}` : undefined}
            >
              →
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
