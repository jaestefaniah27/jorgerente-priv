// Service worker registration shared by every module (/kanban, /fichar, …).
//
// Deliberately does NOT use navigator.serviceWorker.ready: `ready` only
// settles once a registration's scope covers the CURRENT page URL. A module
// lives at "/kanban" while a worker served from "/kanban/sw.js" can only
// claim "/kanban/" by default — which does not cover that page. That mismatch
// is what once left the notifications button hanging on "Comprobando…"
// forever: the worker was registered and activated, but `ready` never
// resolved. Looking the registration up explicitly works from any page.

// Registering a scope above the script's own directory needs the
// Service-Worker-Allowed header, which next.config.ts sets per module.
function scriptUrl(basePath: string) {
  return `${basePath}/sw.js`;
}

function normalise(scopeUrl: string): string {
  try {
    return new URL(scopeUrl).pathname.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

// Matches whichever scope the registration was created under: the broad one
// ("/kanban") or the narrower one an older visit may have registered
// ("/kanban/").
export async function findModuleServiceWorker(
  basePath: string
): Promise<ServiceWorkerRegistration | undefined> {
  const registrations = await navigator.serviceWorker.getRegistrations();
  return registrations.find((r) => normalise(r.scope) === basePath);
}

function waitForActivation(registration: ServiceWorkerRegistration): Promise<void> {
  const worker = registration.active ?? registration.waiting ?? registration.installing;
  if (!worker || worker.state === "activated") return Promise.resolve();
  return new Promise((resolve) => {
    const onStateChange = () => {
      if (worker.state === "activated" || worker.state === "redundant") {
        worker.removeEventListener("statechange", onStateChange);
        resolve();
      }
    };
    worker.addEventListener("statechange", onStateChange);
  });
}

export async function ensureModuleServiceWorker(
  basePath: string
): Promise<ServiceWorkerRegistration> {
  const existing = await findModuleServiceWorker(basePath);
  let registration = existing;
  if (!registration) {
    try {
      registration = await navigator.serviceWorker.register(scriptUrl(basePath), { scope: basePath });
    } catch {
      // The header didn't make it through (a proxy stripped it, say). The
      // narrower scope still works for push: push events go to the
      // registration, which needn't control the current page.
      registration = await navigator.serviceWorker.register(scriptUrl(basePath), {
        scope: `${basePath}/`,
      });
    }
  }
  await waitForActivation(registration);
  return registration;
}
