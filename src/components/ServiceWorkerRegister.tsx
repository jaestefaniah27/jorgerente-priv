"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/kanban/sw.js", { scope: "/kanban/" })
      .catch((err) => console.error("No se pudo registrar el service worker", err));
  }, []);

  return null;
}
