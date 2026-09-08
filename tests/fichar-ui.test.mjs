// Browser-level test for the /fichar module: the PWA plumbing, the
// press-and-hold buttons (including the two cases where they must NOT fire),
// the live counters, the big-counter picker and the history.
//
// Run against a server started with a scratch DB, same as tests/ui.test.mjs.

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

// A real press: pointerdown, wait, pointerup. Playwright's click() is far too
// quick to ever complete a hold, which is the whole point of the control.
async function hold(page, locator, ms = 2400) {
  const box = await locator.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
  await page.waitForTimeout(400); // let the request settle
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

  // --- PWA assets -------------------------------------------------------
  let res = await page.request.get(`${BASE}/fichar/manifest.webmanifest`);
  ok(res.status() === 200, `manifest -> 200 (got ${res.status()})`);
  const manifest = await res.json();
  ok(manifest.scope === "/fichar", `manifest scope is /fichar (got ${manifest.scope})`);
  ok(
    manifest.start_url.startsWith(manifest.scope),
    `start_url (${manifest.start_url}) sits inside the scope (${manifest.scope})`
  );
  ok(manifest.icons?.length === 2, "manifest declares both icons");

  res = await page.request.get(`${BASE}/fichar/sw.js`);
  ok(res.status() === 200, `sw.js -> 200 (got ${res.status()})`);
  ok(
    res.headers()["service-worker-allowed"] === "/fichar",
    `sw.js sends Service-Worker-Allowed: /fichar (got ${res.headers()["service-worker-allowed"]})`
  );

  // --- Service worker scope (the /kanban bug, guarded here too) ---------
  await page.goto(`${BASE}/fichar`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const sw = await page.evaluate(async () => {
    const timeout = (ms, value) => new Promise((r) => setTimeout(() => r(value), ms));
    const regs = await navigator.serviceWorker.getRegistrations();
    const reg = regs.find((r) => new URL(r.scope).pathname.replace(/\/+$/, "") === "/fichar");
    const ready = await Promise.race([
      navigator.serviceWorker.ready.then(() => "settled"),
      timeout(8000, "never-settled"),
    ]);
    return { scopePath: reg ? new URL(reg.scope).pathname : null, state: reg?.active?.state ?? null, ready };
  });
  ok(sw.scopePath === "/fichar", `worker scope covers the page (got ${sw.scopePath})`);
  ok(sw.state === "activated", `worker is activated (got ${sw.state})`);
  ok(sw.ready === "settled", "navigator.serviceWorker.ready settles on /fichar");

  // --- Initial state ----------------------------------------------------
  const clockIn = page.getByRole("button", { name: "Fichar entrada" });
  ok((await clockIn.count()) === 1, "the clock-in button is shown");
  ok(
    (await page.getByText("00:00:00").count()) === 1,
    "the big counter starts at zero"
  );

  // --- A plain tap must NOT clock in ------------------------------------
  await clockIn.click();
  await page.waitForTimeout(600);
  ok(
    (await page.getByRole("button", { name: "Fichar entrada" }).count()) === 1,
    "a plain tap does not clock in"
  );

  // --- Releasing early must NOT clock in --------------------------------
  const box = await clockIn.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  await page.waitForTimeout(600);
  ok(
    (await page.getByRole("button", { name: "Fichar entrada" }).count()) === 1,
    "releasing before 2s does not clock in"
  );
  let state = await (await page.request.get(`${BASE}/api/fichar/state`)).json();
  ok(state.session === null, "no session was created by the aborted presses");

  // --- A full hold clocks in --------------------------------------------
  await hold(page, clockIn);
  ok(
    (await page.getByRole("button", { name: "Fichar salida" }).count()) === 1,
    "holding for 2s clocks in"
  );
  ok((await page.getByRole("button", { name: "Descanso", exact: true }).count()) === 1, "the break button appears");
  state = await (await page.request.get(`${BASE}/api/fichar/state`)).json();
  ok(state.session !== null, "the session exists server-side");

  // The office counter has to actually move.
  await page.getByRole("button", { name: /Oficina/ }).click();
  await page.waitForTimeout(2200);
  const officeText = await page.locator("p.tabular-nums").first().innerText();
  ok(officeText !== "00:00:00", `the office counter is running (got ${officeText})`);

  // --- Breaks -----------------------------------------------------------
  await hold(page, page.getByRole("button", { name: "Descanso", exact: true }));
  ok(
    (await page.getByRole("button", { name: "Terminar descanso" }).count()) === 1,
    "holding the break button starts a break"
  );
  ok((await page.getByText("En descanso").count()) === 1, "the on-break state is visible");

  await hold(page, page.getByRole("button", { name: "Terminar descanso" }));
  ok(
    (await page.getByRole("button", { name: "Descanso", exact: true }).count()) === 1,
    "holding again ends the break"
  );

  // --- The big counter picker persists ----------------------------------
  ok(
    (await page.getByText("OFICINA", { exact: false }).count()) >= 1,
    "the big counter is labelled"
  );
  await page.reload({ waitUntil: "networkidle" });
  const labelAfterReload = await page.locator("p.uppercase").first().innerText();
  ok(
    labelAfterReload.trim().toLowerCase() === "oficina",
    `the chosen big counter survives a reload (got ${labelAfterReload})`
  );

  // --- Clock out --------------------------------------------------------
  await hold(page, page.getByRole("button", { name: "Fichar salida" }));
  ok(
    (await page.getByRole("button", { name: "Fichar entrada" }).count()) === 1,
    "holding clocks out again"
  );
  state = await (await page.request.get(`${BASE}/api/fichar/state`)).json();
  ok(state.session === null, "the session is closed server-side");
  ok(state.todayClosed.officeMs > 0, "the finished session counts towards today");

  // --- History ----------------------------------------------------------
  await page.getByRole("button", { name: "Historial" }).click();
  await page.waitForSelector("text=Historial");
  await page.waitForTimeout(600);
  ok(
    (await page.getByText("cerrada automáticamente").count()) === 0,
    "nothing is flagged as auto-closed in a clean run"
  );
  ok((await page.getByRole("button", { name: "Editar" }).count()) >= 1, "the session can be edited");

  await page.getByRole("button", { name: "Semana anterior" }).click();
  await page.waitForTimeout(600);
  ok(
    (await page.getByRole("button", { name: "Esta semana" }).count()) === 1,
    "moving back a week offers a way to return"
  );
  await page.getByRole("button", { name: "Esta semana" }).click();
  await page.waitForTimeout(600);
  ok(
    (await page.getByRole("button", { name: "Esta semana" }).count()) === 0,
    "back on the current week the shortcut disappears"
  );

  ok(consoleErrors.length === 0, `no console errors (got: ${consoleErrors.join(" | ")})`);

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
