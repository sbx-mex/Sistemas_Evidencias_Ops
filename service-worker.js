const CACHE_PREFIX = "sistema-evidencias-ops-";
const CACHE_NAME = "sistema-evidencias-ops-v19";
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

async function precacheLatest() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(CORE.map(async (path) => {
    const request = new Request(path, { cache: "reload" });
    const response = await fetch(request);
    if (!response.ok) throw new Error(`No se pudo preparar ${path}: ${response.status}`);
    await cache.put(path, response);
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheLatest().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "CLEAR_OLD_CACHES") {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(
        keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
    );
  }
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(networkFirst(event.request));
});
