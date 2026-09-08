// Browser-side helper for Web Push subscription. Kept separate from
// src/lib/push.ts (server-side sending) since this runs in the browser.

import { ensureModuleServiceWorker, findModuleServiceWorker } from "./sw-register";

const KANBAN_BASE = "/kanban";

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

export function ensureServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  return ensureModuleServiceWorker(KANBAN_BASE);
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
  const registration = await findModuleServiceWorker(KANBAN_BASE);
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}
