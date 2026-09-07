import webpush from "web-push";

let configured = false;

export function ensureVapidConfigured() {
  if (configured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:jaestefaniah27@gmail.com";
  if (!publicKey || !privateKey) {
    throw new Error(
      "Faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY en el entorno para usar Web Push"
    );
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export interface StoredSubscription {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Sends a push notification to a single stored subscription.
 * Returns { ok: true } on success, or { ok: false, expired: true } if the
 * push service says the subscription is gone (410/404) so the caller can
 * clean it up.
 */
export async function sendPushToSubscription(
  sub: StoredSubscription,
  payload: { title: string; body: string; url?: string }
): Promise<{ ok: boolean; expired?: boolean; error?: string }> {
  ensureVapidConfigured();
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload)
    );
    return { ok: true };
  } catch (err: unknown) {
    const statusCode =
      typeof err === "object" && err && "statusCode" in err
        ? (err as { statusCode?: number }).statusCode
        : undefined;
    if (statusCode === 404 || statusCode === 410) {
      return { ok: false, expired: true };
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
