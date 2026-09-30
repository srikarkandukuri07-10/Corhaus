self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Pass-through to satisfy Chrome PWA installability offline fetch criteria.
  // Never leave the rejection unhandled: on a genuinely failed network the
  // worker must still settle, otherwise every blip surfaces as an uncaught
  // "Failed to fetch" exception in the console.
  event.respondWith(
    fetch(event.request).then(
      (response) => response,
      () => Response.error()
    )
  );
});
