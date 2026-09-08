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
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { status: "denied" };
    }

    const keyRes = await fetch("/api/kanban/push/vapid-public-key");
    const keyData = await keyRes.json();
    if (!keyData.enabled || !keyData.publicKey) {
      return { status: "disabled" };
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyData.publicKey) as unknown as BufferSource,
      });
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
