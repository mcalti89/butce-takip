/* Build step replaces these literals with the exact exported Web asset set. */
const CACHE_NAME = "budget-pwa-unbuilt";
const PRECACHE = [];
const STATIC_PATHS = new Set(PRECACHE.filter((path) => path !== "/"));
const PREFIX = "budget-pwa-";
self.addEventListener("install", (event) => {
  if (!PRECACHE.length) return;
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
  if (!PRECACHE.length || event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  // Never intercept any API, authentication, storage, or user-generated URL.
  if (
    /^\/(api|oauth|manus-oauth|manus-storage|__manus|__system__)(\/|$)/.test(
      url.pathname,
    )
  )
    return;
  if (event.request.mode === "navigate") {
    if (url.pathname !== "/" && url.pathname !== "/index.html") return;
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(event.request);
          if (response.ok) return response;
        } catch {
          /* Offline shell fallback below. */
        }
        return (
          (await caches.match("/", { cacheName: CACHE_NAME })) ||
          new Response("Uygulamayı önce çevrim içi açın.", {
            status: 503,
            headers: { "Content-Type": "text/plain;charset=utf-8" },
          })
        );
      })(),
    );
    return;
  }
  if (!STATIC_PATHS.has(url.pathname) || url.search) return;
  event.respondWith(
    (async () => {
      const cached = await caches.match(url.pathname, {
        cacheName: CACHE_NAME,
      });
      return cached || fetch(event.request);
    })(),
  );
});
