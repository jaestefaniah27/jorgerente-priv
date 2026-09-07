// Minimal service worker for the /kanban PWA. Scope is /kanban/ (set at
// registration time), so it never intercepts requests for other modules
// (e.g. a future /docs).
//
// Kept intentionally simple: it exists mainly so the module is installable
// and can receive Web Push, not to provide full offline support (the app
// needs live data anyway).

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Pass-through fetch handler. Required for the browser to consider the app
// installable on some platforms; deliberately does no caching to avoid
// serving stale data for a tool the user relies on being current.
self.addEventListener("fetch", () => {});

self.addEventListener("push", (event) => {
  let data = { title: "Jorgerente Kanban", body: "Tienes un aviso pendiente." };
  try {
    if (event.data) data = event.data.json();
  } catch {
    // ignore malformed payloads
  }
  const url = data.url || "/kanban";
  event.waitUntil(
    self.registration.showNotification(data.title || "Jorgerente Kanban", {
      body: data.body,
      icon: "/kanban/icon-192.png",
      badge: "/kanban/icon-192.png",
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/kanban";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
