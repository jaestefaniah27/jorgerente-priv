// Integration test suite for the Kanban API. Plain Node (no test
// framework dependency, consistent with the "simple to maintain" choice
// for this project) — run with: node tests/api.test.mjs
//
// Expects the app to already be running at BASE_URL with a throwaway
// database (KANBAN_DB_PATH pointed at a scratch file).

const BASE = process.env.BASE_URL || "http://localhost:3900";

let passed = 0;
let failed = 0;
const failures = [];

function ok(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(msg);
    console.error(`✗ ${msg}`);
  }
}

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // no body
  }
  return { status: res.status, json };
}

async function main() {
  console.log(`Running API tests against ${BASE}`);

  // --- Projects -----------------------------------------------------
  let r = await api("POST", "/api/kanban/projects", { name: "MX-5", color: "#ef4444" });
  ok(r.status === 201, `create project -> 201 (got ${r.status})`);
  const project = r.json.project;
  ok(project?.name === "MX-5", "created project has correct name");

  r = await api("POST", "/api/kanban/projects", { name: "" });
  ok(r.status === 400, `create project with empty name -> 400 (got ${r.status})`);

  r = await api("POST", "/api/kanban/projects", { name: "TFM" });
  const project2 = r.json.project;
  ok(r.status === 201, "second project created");

  r = await api("GET", "/api/kanban/projects");
  ok(r.status === 200 && r.json.projects.length >= 2, "list projects includes both");

  // --- Epics ----------------------------------------------------------
  r = await api("POST", `/api/kanban/projects/${project.id}/epics`, { name: "Importación" });
  ok(r.status === 201, `create epic -> 201 (got ${r.status})`);
  const epic = r.json.epic;
  ok(epic.project_id === project.id, "epic linked to correct project");

  r = await api("POST", `/api/kanban/projects/999999/epics`, { name: "x" });
  ok(r.status === 404, `create epic on missing project -> 404 (got ${r.status})`);

  // --- Tasks: creation & validation ------------------------------------
  r = await api("POST", "/api/kanban/tasks", {
    project_id: project.id,
    title: "Buscar coches en Alemania",
    priority: "high",
    epic_id: epic.id,
  });
  ok(r.status === 201, `create task -> 201 (got ${r.status})`);
  const task = r.json.task;
  ok(task.status === "todo", "new task defaults to todo");
  ok(task.priority === "high", "task priority saved");

  r = await api("POST", "/api/kanban/tasks", { project_id: project.id, title: "" });
  ok(r.status === 400, `create task with empty title -> 400 (got ${r.status})`);

  r = await api("POST", "/api/kanban/tasks", { project_id: project.id, title: "x", priority: "meh" });
  ok(r.status === 400, `create task with invalid priority -> 400 (got ${r.status})`);

  r = await api("POST", "/api/kanban/tasks", {
    project_id: project.id,
    title: "Épica de otro proyecto",
    epic_id: 999999,
  });
  ok(r.status === 400, `create task with epic from another project -> 400 (got ${r.status})`);

  // A task in project2 using project1's epic must be rejected.
  r = await api("POST", "/api/kanban/tasks", {
    project_id: project2.id,
    title: "cross-project epic",
    epic_id: epic.id,
  });
  ok(r.status === 400, `create task with cross-project epic -> 400 (got ${r.status})`);

  // --- Due date + reminder ---------------------------------------------
  const dueAt = new Date(Date.now() + 3600_000).toISOString(); // 1h from now
  r = await api("POST", "/api/kanban/tasks", {
    project_id: project.id,
    title: "Con fecha límite",
    due_at: dueAt,
    reminder_offset_minutes: 30,
  });
  ok(r.status === 201, "create task with due date + reminder -> 201");
  const taskWithDue = r.json.task;
  const expectedReminder = new Date(new Date(dueAt).getTime() - 30 * 60_000).toISOString();
  ok(
    taskWithDue.reminder_at === expectedReminder,
    `reminder_at computed correctly (got ${taskWithDue.reminder_at}, expected ${expectedReminder})`
  );

  r = await api("POST", "/api/kanban/tasks", {
    project_id: project.id,
    title: "Aviso sin fecha límite",
    reminder_offset_minutes: 30,
  });
  ok(r.status === 400, `reminder without due date -> 400 (got ${r.status})`);

  // --- Task update: status transitions (drag & drop equivalent) --------
  r = await api("PATCH", `/api/kanban/tasks/${task.id}`, { status: "in_progress" });
  ok(r.status === 200 && r.json.task.status === "in_progress", "task moved to in_progress");

  r = await api("PATCH", `/api/kanban/tasks/${task.id}`, { status: "bogus" });
  ok(r.status === 400, `invalid status -> 400 (got ${r.status})`);

  // Editing due date recalculates reminder_at.
  const newDueAt = new Date(Date.now() + 7200_000).toISOString();
  r = await api("PATCH", `/api/kanban/tasks/${taskWithDue.id}`, { due_at: newDueAt });
  const recalced = new Date(new Date(newDueAt).getTime() - 30 * 60_000).toISOString();
  ok(
    r.json.task.reminder_at === recalced,
    `editing due_at recalculates reminder_at (got ${r.json.task.reminder_at}, expected ${recalced})`
  );

  // Clearing due date clears the reminder too.
  r = await api("PATCH", `/api/kanban/tasks/${taskWithDue.id}`, { due_at: null });
  ok(
    r.json.task.due_at === null && r.json.task.reminder_at === null,
    "clearing due_at also clears reminder_at"
  );

  // --- Time entries -------------------------------------------------
  r = await api("POST", `/api/kanban/tasks/${task.id}/time-entries`, {
    minutes: 90,
    note: "primera sesión",
    logged_on: "2026-09-01",
  });
  ok(r.status === 201, `log time entry -> 201 (got ${r.status})`);
  const entry1 = r.json.timeEntry;

  r = await api("POST", `/api/kanban/tasks/${task.id}/time-entries`, { minutes: 0 });
  ok(r.status === 400, `zero-minute time entry rejected -> 400 (got ${r.status})`);

  r = await api("POST", `/api/kanban/tasks/${task.id}/time-entries`, { minutes: 30 });
  ok(r.status === 201, "second time entry logged");

  r = await api("GET", `/api/kanban/tasks/${task.id}`);
  ok(r.status === 200 && r.json.timeEntries.length === 2, "task detail lists both time entries");

  r = await api("GET", "/api/kanban/tasks");
  const taskInList = r.json.tasks.find((t) => t.id === task.id);
  ok(taskInList.time_spent_minutes === 120, `aggregated time_spent_minutes is 120 (got ${taskInList.time_spent_minutes}`);

  r = await api("DELETE", `/api/kanban/time-entries/${entry1.id}`);
  ok(r.status === 200, "delete time entry -> 200");

  r = await api("GET", "/api/kanban/tasks");
  const taskAfterDelete = r.json.tasks.find((t) => t.id === task.id);
  ok(taskAfterDelete.time_spent_minutes === 30, "time_spent_minutes updates after deleting an entry");

  // --- Global filtering -------------------------------------------------
  r = await api("GET", `/api/kanban/tasks?projectId=${project.id}`);
  ok(
    r.json.tasks.every((t) => t.project_id === project.id),
    "filter by projectId returns only that project's tasks"
  );

  r = await api("GET", `/api/kanban/tasks?priority=high`);
  ok(
    r.json.tasks.length > 0 && r.json.tasks.every((t) => t.priority === "high"),
    "filter by priority works"
  );

  r = await api("GET", `/api/kanban/tasks?epicId=${epic.id}`);
  ok(
    r.json.tasks.length > 0 && r.json.tasks.every((t) => t.epic_id === epic.id),
    "filter by epicId works"
  );

  r = await api(
    "GET",
    `/api/kanban/tasks?projectId=${project.id},${project2.id}`
  );
  const projectIdsSeen = new Set(r.json.tasks.map((t) => t.project_id));
  ok(
    [...projectIdsSeen].every((id) => id === project.id || id === project2.id),
    "filter by multiple projectIds (global aggregated view)"
  );

  // --- 404s -------------------------------------------------------------
  r = await api("GET", "/api/kanban/tasks/999999");
  ok(r.status === 404, `get missing task -> 404 (got ${r.status})`);
  r = await api("PATCH", "/api/kanban/tasks/999999", { title: "x" });
  ok(r.status === 404, `patch missing task -> 404 (got ${r.status})`);
  r = await api("DELETE", "/api/kanban/projects/999999");
  ok(r.status === 404, `delete missing project -> 404 (got ${r.status})`);

  // --- Cascade delete -----------------------------------------------
  r = await api("DELETE", `/api/kanban/projects/${project2.id}`);
  ok(r.status === 200, "delete project -> 200");
  r = await api("GET", `/api/kanban/tasks?projectId=${project2.id}`);
  ok(r.json.tasks.length === 0, "deleting a project cascades and removes its tasks");

  // --- Push endpoints -----------------------------------------------
  r = await api("GET", "/api/kanban/push/vapid-public-key");
  ok(r.status === 200 && typeof r.json.enabled === "boolean", "vapid-public-key endpoint responds");

  r = await api("POST", "/api/kanban/push/subscribe", {
    endpoint: "http://localhost:9999/fake-push-endpoint",
    keys: { p256dh: "fake-p256dh", auth: "fake-auth" },
  });
  ok(r.status === 201, `save push subscription -> 201 (got ${r.status})`);

  r = await api("DELETE", "/api/kanban/push/subscribe", {
    endpoint: "http://localhost:9999/fake-push-endpoint",
  });
  ok(r.status === 200, "delete push subscription -> 200");

  // --- Delete task cleanup ----------------------------------------------
  r = await api("DELETE", `/api/kanban/tasks/${task.id}`);
  ok(r.status === 200, "delete task -> 200");
  r = await api("GET", `/api/kanban/tasks/${task.id}`);
  ok(r.status === 404, "deleted task no longer reachable");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error("\nFailures:\n" + failures.map((f) => ` - ${f}`).join("\n"));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test run crashed:", err);
  process.exit(1);
});
