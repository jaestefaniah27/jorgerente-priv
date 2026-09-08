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
  // Headless Chromium has no push service, so the push subscription step is
  // expected to fail noisily here. That noise isn't a regression; anything
  // else still is.
  const isExpectedPushNoise = (text) =>
    /push|notification|AbortError|Registration failed/i.test(text);
  page.on("console", (msg) => {
    if (msg.type() === "error" && !isExpectedPushNoise(msg.text())) consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => {
    if (!isExpectedPushNoise(String(err))) consoleErrors.push(String(err));
  });

  // --- PWA assets reachable -------------------------------------------
  let res = await page.request.get(`${BASE}/kanban/manifest.webmanifest`);
  ok(res.status() === 200, `manifest.webmanifest -> 200 (got ${res.status()})`);
  const manifest = await res.json();
  ok(manifest.scope === "/kanban", "manifest scope is /kanban");
  ok(
    manifest.start_url.startsWith(manifest.scope),
    `manifest start_url (${manifest.start_url}) is inside its scope (${manifest.scope})`
  );
  ok(Array.isArray(manifest.icons) && manifest.icons.length === 2, "manifest declares icons");

  res = await page.request.get(`${BASE}/kanban/sw.js`);
  ok(res.status() === 200, `sw.js -> 200 (got ${res.status()})`);
  ok(
    res.headers()["service-worker-allowed"] === "/kanban",
    `sw.js sends Service-Worker-Allowed: /kanban (got ${res.headers()["service-worker-allowed"]})`
  );

  // --- Empty state -------------------------------------------------
  await page.goto(`${BASE}/kanban`, { waitUntil: "networkidle" });
  ok((await page.title()).includes("Kanban"), `page title mentions Kanban (got "${await page.title()}")`);
  ok(
    (await page.getByText("Todavía no tienes ningún proyecto").count()) === 1,
    "empty state message shown with no projects"
  );

  // Regression guard for the "Activar avisos" hang. The worker used to be
  // registered with scope "/kanban/", which does NOT cover the global view
  // at "/kanban" (no trailing slash) — so navigator.serviceWorker.ready
  // never settled there and the subscription flow hung forever on
  // "Comprobando…". Everything below is raced against a timeout so a
  // regression fails the test instead of hanging it.
  const sw = await page.evaluate(async () => {
    const timeout = (ms, value) => new Promise((r) => setTimeout(() => r(value), ms));
    const regs = await navigator.serviceWorker.getRegistrations();
    const reg = regs.find((r) => new URL(r.scope).pathname.replace(/\/+$/, "") === "/kanban");
    const ready = await Promise.race([
      navigator.serviceWorker.ready.then(() => "settled"),
      timeout(8000, "never-settled"),
    ]);
    return {
      found: !!reg,
      scopePath: reg ? new URL(reg.scope).pathname : null,
      activated: reg?.active?.state ?? null,
      ready,
    };
  });
  ok(sw.found, "service worker registration found for the kanban module");
  ok(sw.scopePath === "/kanban", `worker scope covers the global view (got ${sw.scopePath})`);
  ok(sw.activated === "activated", `worker is activated (got ${sw.activated})`);
  ok(
    sw.ready === "settled",
    "navigator.serviceWorker.ready settles on /kanban (the bug that hung 'Activar avisos')"
  );

  // And the user-visible symptom: clicking "Activar avisos" must reach a
  // definite outcome. Headless Chromium has no real push service, so the
  // subscription itself is expected to fail here — what this asserts is
  // that the button stops saying "Comprobando…" instead of hanging.
  await page.context().grantPermissions(["notifications"], { origin: BASE });
  const notifyButton = page.getByRole("button", { name: /Activar avisos|Comprobando/ });
  if ((await notifyButton.count()) > 0) {
    await notifyButton.first().click();
    let settledLabel = null;
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(500);
      const stillChecking =
        (await page.getByRole("button", { name: "Comprobando…" }).count()) > 0;
      if (!stillChecking) {
        settledLabel = (await page.locator("nav").innerText()).includes("Avisos activados")
          ? "subscribed"
          : "resolved";
        break;
      }
    }
    ok(
      settledLabel !== null,
      "'Activar avisos' reaches a definite state instead of hanging on 'Comprobando…'"
    );
  } else {
    ok(false, "notifications toggle button rendered in the nav");
  }

  // --- Create a project via the UI --------------------------------------
  await page.getByText("+ Nuevo proyecto").click();
  await page.getByPlaceholder("Nombre del proyecto").fill("MX-5");
  await page.getByRole("button", { name: "Crear" }).click();
  await page.waitForSelector("text=MX-5");
  ok(true, "project 'MX-5' created via UI");

  // Nav should now show the project link.
  await page.waitForSelector('nav >> text=MX-5');

  // --- Go to the board and create a task ---------------------------------
  // Two links to the same board exist (the top nav pill, and the "Tus
  // tableros" card in the global view) — scope to the nav to disambiguate.
  await page.locator("nav").getByRole("link", { name: /MX-5/ }).click();
  await page.waitForURL(/\/kanban\/board\/\d+/);
  ok((await page.locator("h1", { hasText: "MX-5" }).count()) >= 1, "board page shows project name");

  // Only the Backlog column has an "add task" button — clicking it opens
  // the full creation modal (title, priority, epic, estimate, due date +
  // reminder, and the "send straight to To Do" checkbox).
  ok(
    (await page.locator('input[placeholder="+ nueva tarea"]').count()) === 0,
    "no inline quick-add input remains on any column"
  );
  await page.getByRole("button", { name: "Nueva tarea" }).click();
  await page.waitForSelector("text=Nueva tarea", { state: "visible" });
  await page.getByLabel("Título").fill("Buscar coches en Alemania");
  await page.getByRole("button", { name: "Crear tarea" }).click();
  await page.waitForSelector("text=Nueva tarea", { state: "detached" });
  ok(true, "task created via the Backlog 'Nueva tarea' modal");

  const backlogColumn = page.locator("text=BACKLOG").locator("..").locator("..");
  ok(
    (await backlogColumn.getByText("Buscar coches en Alemania").count()) === 1,
    "task lands in Backlog by default (checkbox left unchecked)"
  );

  // Also verify the "send straight to To Do" checkbox works.
  await page.getByRole("button", { name: "Nueva tarea" }).click();
  await page.waitForSelector("text=Nueva tarea", { state: "visible" });
  await page.getByLabel("Título").fill("Tarea directa a To Do");
  await page.getByText("Enviar directamente a To Do").click();
  await page.getByRole("button", { name: "Crear tarea" }).click();
  await page.waitForSelector("text=Nueva tarea", { state: "detached" });
  const todoColumnCheck = page.locator("h2", { hasText: "To Do" }).locator("..").locator("..");
  ok(
    (await todoColumnCheck.getByText("Tarea directa a To Do").count()) === 1,
    "checkbox sends the task straight to To Do instead of Backlog"
  );

  // Move the main test task from Backlog into To Do with the arrow button
  // before exercising the rest of the edit flow.
  const backlogCard = page.locator('[data-task-id]', { hasText: "Buscar coches en Alemania" });
  await backlogCard.getByRole("button", { name: "→" }).click();
  await page.waitForTimeout(300);

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
