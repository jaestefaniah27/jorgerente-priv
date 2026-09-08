// Minimal service worker for the /fichar PWA. Scope is /fichar (no trailing
// slash, granted by the Service-Worker-Allowed header) so it covers the page
// itself and not just paths beneath it.
//
// No push or notificationclick handlers: this module has no notifications in
// v1. The worker exists so the module is installable on the home screen.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Pass-through fetch handler. Required for the browser to consider the app
// installable; deliberately does no caching — a time clock must never show
// stale state.
self.addEventListener("fetch", () => {});
