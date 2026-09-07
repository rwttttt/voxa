// VOXA service worker — enables "Add to Home Screen" / install, and basic offline support.
const CACHE_VERSION = "voxa-v1";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./voxa_model.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      // Cache what we can; don't fail install if one file (e.g. voxa_model.json) is briefly missing.
      Promise.allSettled(APP_SHELL.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isMediapipeCdn = url.hostname === "cdn.jsdelivr.net";

  if (!isSameOrigin && !isMediapipeCdn) return; // let everything else (e.g. any API calls) pass through untouched

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      // Stale-while-revalidate: serve cache instantly if we have it, refresh in background.
      return cached || network;
    })
  );
});
