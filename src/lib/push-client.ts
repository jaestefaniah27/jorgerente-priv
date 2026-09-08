// Browser-side helper for Web Push subscription. Kept separate from
// src/lib/push.ts (server-side sending) since this runs in the browser.

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

// Wraps a promise so it can never hang the caller forever. Some browsers
// don't reject Notification.requestPermission() when they decline to show
// a real prompt — Chrome's "quiet" permission UI, for example, renders as a
// small, easy-to-miss icon next to the address bar instead of a banner, and
// the promise then simply never settles until that icon is clicked. Without
// this, that leaves the button stuck on "Comprobando…" forever with no
// error and nothing wrong to report. A similar risk exists for
// serviceWorker.ready if activation ever stalls.
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

export async function subscribeToPush(): Promise<
  { status: "subscribed" } | { status: "unsupported" | "disabled" | "denied" | "error"; message?: string }
> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { status: "unsupported" };
  }

  // Everything below is wrapped in one try/catch: Notification.requestPermission()
  // in particular can throw synchronously in some browsers (notably Safari,
  // which requires the call to happen directly inside a user-gesture handler
  // — an earlier `await` before it, or an uncaught rejection anywhere in this
  // chain, used to leave the caller's promise permanently unresolved and the
  // "Activar avisos" button stuck on "Comprobando…" forever). Request
  // permission first, before any other await, to keep it as close to the
  // click as possible.
  try {
    const permission = await withTimeout(
      Notification.requestPermission(),
      20000,
      "El navegador no respondió a la petición de permiso de notificaciones en 20s. Puede que haya quedado un aviso pendiente junto a la barra de direcciones (a veces se muestra como un pequeño icono en vez de una ventana emergente) o que las notificaciones estén bloqueadas para este sitio: revísalo y vuelve a intentarlo."
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
      navigator.serviceWorker.ready,
      15000,
      "El service worker no se activó a tiempo. Recarga la página e inténtalo de nuevo."
    );
    let subscription = await withTimeout(
      registration.pushManager.getSubscription(),
      10000,
      "El navegador no respondió al comprobar la suscripción existente. Recarga la página e inténtalo de nuevo."
    );
    if (!subscription) {
      // The actual subscribe() call — right after granting permission — is
      // the step known to hang indefinitely in Safari (a long-standing
      // WebKit issue: it neither resolves nor rejects under some
      // conditions). This is the step Jorge hit: permission granted, then
      // stuck on "Comprobando…" with nothing ever happening.
      subscription = await withTimeout(
        registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyData.publicKey) as unknown as BufferSource,
        }),
        15000,
        "Safari no completó la suscripción a notificaciones push a tiempo (es un fallo conocido de WebKit). Prueba a recargar la página y a repetirlo; si sigue sin funcionar, puede ser una limitación de Safari en este equipo."
      );
    }
    await fetch("/api/kanban/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    });
    return { status: "subscribed" };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration("/kanban/");
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}
