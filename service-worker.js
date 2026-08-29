const CACHE_NAME = "sistema-evidencias-ops-v17";
const CORE = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./pdf-export.js",
  "./xlsx-export.js",
  "./manifest.webmanifest",
  "./assets/ui/Damos_Seguimiento.webp",
  "./assets/ui/Un_placer_haber_Ayudado.webp",
  "./exports/Resumen_Evidencias_OPS.xlsx",
  "./exports/Resumen_Evidencias_OPS.pdf",
  "./assets/icons/icon-64.webp",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/director/jorge-alcantar.webp",
  "./assets/dm/enrique-cesar.webp",
  "./assets/dm/nancy-carolina.webp",
  "./assets/dm/vanessa-carreno.webp",
  "./assets/dm/veronica-garcia.webp",
  "./assets/dm/yazmin-chabela.webp",
  "./assets/dm/yazmin-garcia.webp"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

function networkFirst(request) {
  return fetch(request).then((response) => {
    if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
    return response;
  }).catch(() => caches.match(request));
}

function staleWhileRevalidate(request) {
  return caches.match(request).then((cached) => {
    const update = fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      return response;
    }).catch(() => cached);
    return cached || update;
  });
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === "navigate" || url.pathname.endsWith("/data/dashboard.json")) {
    event.respondWith(networkFirst(event.request));
    return;
  }
  event.respondWith(staleWhileRevalidate(event.request));
});
