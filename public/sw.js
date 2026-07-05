self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Pass-through to satisfy Chrome PWA installability offline fetch criteria
  event.respondWith(fetch(event.request));
});
