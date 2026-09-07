// Browser-level smoke test using the pre-installed Chromium. Covers what
// the API tests can't: that the pages actually render, the core user flow
// works end to end through real UI interactions (create project → create
// task → edit it → move it across columns), and the PWA plumbing
// (manifest, service worker) is reachable. Run against a server started
// with a scratch DB, same as tests/api.test.mjs.

import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:3900";

let passed = 0;
let failed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    failures.push(msg);
    console.error(`✗ ${msg}`);
  }
}

async function main() {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox"],
  });
  const consoleErrors = [];
  const page = await browser.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  // --- PWA assets reachable -------------------------------------------
  let res = await page.request.get(`${BASE}/kanban/manifest.webmanifest`);
  ok(res.status() === 200, `manifest.webmanifest -> 200 (got ${res.status()})`);
  const manifest = await res.json();
  ok(manifest.scope === "/kanban/", "manifest scope is /kanban/");
  ok(Array.isArray(manifest.icons) && manifest.icons.length === 2, "manifest declares icons");

  res = await page.request.get(`${BASE}/kanban/sw.js`);
  ok(res.status() === 200, `sw.js -> 200 (got ${res.status()})`);

  // --- Empty state -------------------------------------------------
  await page.goto(`${BASE}/kanban`, { waitUntil: "networkidle" });
  ok((await page.title()).includes("Kanban"), `page title mentions Kanban (got "${await page.title()}")`);
  ok(
    (await page.getByText("Todavía no tienes ningún proyecto").count()) === 1,
    "empty state message shown with no projects"
  );

  const swRegistered = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration("/kanban/");
    return !!reg;
  });
  ok(swRegistered, "service worker registered with /kanban/ scope");

  // --- Create a project via the UI --------------------------------------
  await page.getByText("+ Nuevo proyecto").click();
  await page.getByPlaceholder("Nombre del proyecto").fill("MX-5");
  await page.getByRole("button", { name: "Crear" }).click();
  await page.waitForSelector("text=MX-5");
  ok(true, "project 'MX-5' created via UI");

  // Nav should now show the project link.
  await page.waitForSelector('nav >> text=MX-5');

  // --- Go to the board and create a task ---------------------------------
  await page.getByRole("link", { name: /MX-5/ }).click();
  await page.waitForURL(/\/kanban\/board\/\d+/);
  ok((await page.locator("h1", { hasText: "MX-5" }).count()) >= 1, "board page shows project name");

  const todoInput = page.locator('input[placeholder="+ nueva tarea"]').first();
  await todoInput.fill("Buscar coches en Alemania");
  await todoInput.press("Enter");
  await page.waitForSelector("text=Buscar coches en Alemania");
  ok(true, "task created via quick-add in To Do column");

  // --- Open task, edit priority + due date + reminder, save --------------
  await page.getByText("Buscar coches en Alemania").click();
  await page.waitForSelector("text=Editar tarea");

  await page.getByLabel("Prioridad").selectOption("urgent");
  // Set a due date a bit in the future so the reminder offset select enables.
  const future = new Date(Date.now() + 3 * 24 * 3600_000);
  const pad = (n) => String(n).padStart(2, "0");
  const dueValue = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}T10:00`;
  await page.getByLabel("Fecha límite (opcional)").fill(dueValue);
  await page.getByLabel("Aviso").selectOption("1440"); // "1 día antes"

  // Log some time while we're in there (this is the time-entry "Minutos"
  // field, distinct from the "Estimación (horas)" field above it).
  await page.getByLabel("Fecha", { exact: true }).fill(new Date().toISOString().slice(0, 10));
  await page.getByRole("spinbutton", { name: "Minutos" }).fill("45");
  await page.getByRole("button", { name: "Añadir" }).click();
  await page.waitForSelector("text=45m");

  await page.getByRole("button", { name: "Guardar" }).click();
  await page.waitForSelector("text=Editar tarea", { state: "detached" });

  ok((await page.getByText("URGENTE").count()) >= 1, "priority badge updated to URGENTE after save");
  ok((await page.getByText(/⏱ 45m/).count()) >= 1, "logged time reflected on the card");

  // --- Move the task with the arrow button -------------------------------
  const card = page.locator('[data-task-id]', { hasText: "Buscar coches en Alemania" });
  await card.getByRole("button", { name: "→" }).click();
  await page.waitForTimeout(300); // allow the PATCH + re-render
  const inProgressColumn = page.locator("text=EN PROGRESO").locator("..").locator("..");
  ok(
    (await inProgressColumn.getByText("Buscar coches en Alemania").count()) === 1,
    "task moved to 'En progreso' column after clicking →"
  );

  // --- Global view reflects the same task -------------------------------
  await page.getByRole("link", { name: "Vista global" }).click();
  await page.waitForURL(/\/kanban$/);
  await page.waitForSelector("text=Buscar coches en Alemania");
  ok(true, "task visible from the global aggregated view");

  ok(consoleErrors.length === 0, `no console errors during the whole flow (got: ${consoleErrors.join(" | ")})`);

  await browser.close();

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
