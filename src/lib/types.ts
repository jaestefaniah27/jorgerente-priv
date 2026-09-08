export type Priority = "low" | "medium" | "high" | "urgent";
export type Status = "backlog" | "todo" | "in_progress" | "done";

export const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];
export const STATUSES: Status[] = ["backlog", "todo", "in_progress", "done"];

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
};

export const STATUS_LABELS: Record<Status, string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "En progreso",
  done: "Hecho",
};

// New tasks land here by default (see NewTaskModal) unless explicitly sent
// straight to To Do.
export const DEFAULT_NEW_TASK_STATUS: Status = "backlog";

export const REMINDER_OFFSETS: { minutes: number; label: string }[] = [
  { minutes: 10, label: "10 minutos antes" },
  { minutes: 30, label: "30 minutos antes" },
  { minutes: 60, label: "1 hora antes" },
  { minutes: 180, label: "3 horas antes" },
  { minutes: 1440, label: "1 día antes" },
  { minutes: 2880, label: "2 días antes" },
];

export interface Project {
  id: number;
  name: string;
  color: string;
  created_at: string;
}

export interface Epic {
  id: number;
  project_id: number;
  name: string;
  color: string;
  created_at: string;
}

export interface Task {
  id: number;
  project_id: number;
  epic_id: number | null;
  title: string;
  description: string;
  priority: Priority;
  status: Status;
  estimate_minutes: number | null;
  due_at: string | null;
  reminder_offset_minutes: number | null;
  reminder_at: string | null;
  reminder_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimeEntry {
  id: number;
  task_id: number;
  minutes: number;
  note: string;
  logged_on: string;
  created_at: string;
}

export interface TaskWithExtras extends Task {
  project_name: string;
  project_color: string;
  epic_name: string | null;
  epic_color: string | null;
  time_spent_minutes: number;
}
