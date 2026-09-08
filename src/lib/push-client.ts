// Browser-side helper for Web Push subscription. Kept separate from
// src/lib/push.ts (server-side sending) since this runs in the browser.

const SW_URL = "/kanban/sw.js";
// Broad scope so the worker also covers the global view at "/kanban"
// (no trailing slash). Registering a scope above the script's own
// directory requires the Service-Worker-Allowed header, which
// next.config.ts sets for /kanban/sw.js.
const SW_SCOPE = "/kanban";
// Scope the script gets by default when the header isn't honoured (e.g.
// a proxy strips it). Push still works from here — push events go to the
// registration, which does not need to control the current page.
const SW_FALLBACK_SCOPE = "/kanban/";

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Wraps a promise so it can never hang the caller forever. Belt and braces
// for the browser APIs below, which under some conditions neither resolve
// nor reject (Safari's pushManager.subscribe() is a known offender).
function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

// Finds this module's registration whatever scope it was created under —
// "/kanban" (current) or "/kanban/" (what older visits registered).
async function findKanbanRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  const registrations = await navigator.serviceWorker.getRegistrations();
  return registrations.find((r) => {
    try {
      return new URL(r.scope).pathname.replace(/\/+$/, "") === "/kanban";
    } catch {
      return false;
    }
  });
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

// Registers (or reuses) the service worker and waits until it is actually
// activated.
//
// Deliberately does NOT use navigator.serviceWorker.ready: `ready` only
// settles once a registration's scope covers the CURRENT page URL, and the
// global view lives at "/kanban" while the worker's original scope was
// "/kanban/" — which does not cover it. That is the bug behind "Activar
// avisos" hanging on "Comprobando…" forever: the worker was registered and
// activated, but `ready` simply never resolved on that page. Verified in a
// real browser: on /kanban it never settles, on /kanban/board/N it does.
// Looking the registration up explicitly works from any page.
export async function ensureServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await findKanbanRegistration();
  let registration = existing;
  if (!registration) {
    try {
      registration = await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
    } catch {
      registration = await navigator.serviceWorker.register(SW_URL, { scope: SW_FALLBACK_SCOPE });
    }
  }
  await waitForActivation(registration);
  return registration;
}

export async function subscribeToPush(): Promise<
  { status: "subscribed" } | { status: "unsupported" | "disabled" | "denied" | "error"; message?: string }
> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { status: "unsupported" };
  }

  try {
    // Request permission first, before any other await, so the call stays as
    // close to the click as possible — Safari requires it to happen inside
    // the user-gesture handler.
    const permission = await withTimeout(
      Notification.requestPermission(),
      20000,
      "El navegador no respondió a la petición de permiso de notificaciones. Puede que haya quedado un aviso pendiente junto a la barra de direcciones, o que las notificaciones estén bloqueadas para este sitio."
    );
    if (permission !== "granted") {
      return { status: "denied" };
    }

    const keyRes = await fetch("/api/kanban/push/vapid-public-key");
    const keyData = await keyRes.json();
    if (!keyData.enabled || !keyData.publicKey) {
      return { status: "disabled" };
    }

    const registration = await withTimeout(
      ensureServiceWorkerRegistration(),
      15000,
      "El service worker no se activó a tiempo. Recarga la página e inténtalo de nuevo."
    );

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await withTimeout(
        registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyData.publicKey) as unknown as BufferSource,
        }),
        20000,
        "El navegador no completó la suscripción a notificaciones push. En iPhone/iPad hace falta añadir la app a la pantalla de inicio para que Safari permita los avisos."
      );
    }

    const saveRes = await fetch("/api/kanban/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    });
    if (!saveRes.ok) {
      return { status: "error", message: "No se pudo guardar la suscripción en el servidor." };
    }
    return { status: "subscribed" };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  const registration = await findKanbanRegistration();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}
