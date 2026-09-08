"use client";

import { useEffect } from "react";
import { ensureServiceWorkerRegistration } from "@/lib/push-client";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    // Shares one registration helper with the push subscription flow, so
    // both agree on the scope and on what "registered and active" means.
    ensureServiceWorkerRegistration().catch((err) =>
      console.error("No se pudo registrar el service worker", err)
    );
  }, []);

  return null;
}
