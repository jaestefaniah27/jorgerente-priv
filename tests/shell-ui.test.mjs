// Covers the shell shared by every module: the home page that lists the apps
// and the four-squares switcher that jumps between them without going home.
//
// Run against a server started with a scratch DB, same as the other UI tests.

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

  // --- Home page --------------------------------------------------------
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  ok(new URL(page.url()).pathname === "/", `the root serves the home page (got ${page.url()})`);
  ok((await page.getByRole("link", { name: /Kanban/ }).count()) === 1, "home links to Kanban");
  ok((await page.getByRole("link", { name: /Fichar/ }).count()) === 1, "home links to Fichar");
  // Docs isn't built yet: shown, but deliberately not a link.
  ok((await page.getByText("Docs").count()) === 1, "home lists Docs");
  ok((await page.getByRole("link", { name: /Docs/ }).count()) === 0, "Docs is not clickable yet");
  ok((await page.getByText("próximamente").count()) === 1, "Docs is marked as coming later");

  await page.getByRole("link", { name: /Kanban/ }).click();
  await page.waitForURL(/\/kanban$/);
  ok(true, "home navigates into Kanban");

  // --- Switcher: Kanban → Fichar ---------------------------------------
  const switcher = page.getByRole("button", { name: "Cambiar de app" });
  ok((await switcher.count()) === 1, "the switcher is present in Kanban");
  ok(
    (await page.getByRole("menu").count()) === 0,
    "the menu stays closed until the button is used"
  );

  await switcher.click();
  ok((await page.getByRole("menu").count()) === 1, "clicking the switcher opens the menu");
  ok(
    (await page.getByRole("menuitem", { name: /Fichar/ }).count()) === 1,
    "the menu offers the other app"
  );
  ok(
    (await page.getByLabel("app actual").count()) === 1,
    "the app you're already in is marked"
  );

  // Escape closes it without navigating.
  await page.keyboard.press("Escape");
  ok((await page.getByRole("menu").count()) === 0, "Escape closes the menu");
  ok(new URL(page.url()).pathname === "/kanban", "Escape doesn't navigate anywhere");

  // Clicking outside closes it too.
  await switcher.click();
  ok((await page.getByRole("menu").count()) === 1, "the menu reopens");
  await page.mouse.click(5, 300);
  ok((await page.getByRole("menu").count()) === 0, "clicking outside closes the menu");

  await switcher.click();
  await page.getByRole("menuitem", { name: /Fichar/ }).click();
  await page.waitForURL(/\/fichar$/);
  ok(true, "the switcher jumps from Kanban to Fichar");

  // --- Switcher: Fichar → Kanban ---------------------------------------
  const switcherFichar = page.getByRole("button", { name: "Cambiar de app" });
  ok((await switcherFichar.count()) === 1, "the switcher is present in Fichar too");
  await switcherFichar.click();
  await page.getByRole("menuitem", { name: /Kanban/ }).click();
  await page.waitForURL(/\/kanban$/);
  ok(true, "and back the other way");

  // --- "Ver todas" returns home ----------------------------------------
  await page.getByRole("button", { name: "Cambiar de app" }).click();
  await page.getByRole("menuitem", { name: "Ver todas" }).click();
  await page.waitForURL(new RegExp(`^${BASE}/$`));
  ok(true, "the menu offers a way back to the home page");

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
