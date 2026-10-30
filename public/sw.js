self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Pass-through to satisfy Chrome PWA installability offline fetch criteria.
  event.respondWith(
    fetch(event.request).then(
      (response) => response,
      () => Response.error()
    )
  );
});

// ─── PUSH NOTIFICATIONS HANDLER ──────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = {
    title: "Corhaus Pilates",
    body: "You have a new update from Corhaus Pilates.",
    icon: "/corhaus-logo.png",
    badge: "/corhaus-badge.png",
    data: { url: "/" },
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch (err) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || "/corhaus-logo.png",
    badge: data.badge || "/corhaus-badge.png",
    vibrate: [100, 50, 100],
    data: data.data || { url: "/" },
    tag: data.tag || `corhaus-${Date.now()}`,
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// ─── NOTIFICATION CLICK HANDLER ──────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus existing tab if open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          if ("navigate" in client && targetUrl !== "/") {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      // Otherwise open new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
