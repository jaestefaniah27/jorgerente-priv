"use client";

import { useEffect } from "react";
import { ensureModuleServiceWorker } from "@/lib/sw-register";

// Shares one registration helper with the push subscription flow, so both
// agree on the scope and on what "registered and active" means.
export default function ServiceWorkerRegister({ basePath = "/kanban" }: { basePath?: string }) {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    ensureModuleServiceWorker(basePath).catch((err) =>
      console.error("No se pudo registrar el service worker", err)
    );
  }, [basePath]);

  return null;
}
