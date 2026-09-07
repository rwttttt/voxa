// VOXA service worker — enables "Add to Home Screen" / install, and basic offline support.
// CACHE_VERSION is bumped on every deploy that fixes a bug: the old stale-while-revalidate
// strategy served the cached index.html instantly on every visit (even after a fresh upload),
// which meant a bug fix could look like it "didn't work" when it was really just never loaded.
// Bumping this purges the old cache on activate, and the fetch handler below now goes
// network-first for the app shell so a new deploy is picked up on the very next load.
const CACHE_VERSION = "voxa-v2";
 
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
 
  // The app shell (the page itself, plus the model file whose predictions depend on it)
  // goes network-first: always try for a fresh copy so a new deploy takes effect on the
  // very next load, and only fall back to the cache when there's no network at all. Static
  // assets that don't change often (icons, the CDN) stay on the cache-first / stale-while-
  // revalidate path below, since instant-from-cache is the right trade-off for those.
  const isAppShell = isSameOrigin && (
    req.mode === "navigate" ||
    url.pathname.endsWith("/") ||
    url.pathname.endsWith("index.html") ||
    url.pathname.endsWith("voxa_model.json")
  );
 
  if (isAppShell) {
    event.respondWith(
      fetch(req, { cache: "no-store" })
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }
 
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
