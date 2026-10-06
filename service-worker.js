importScripts("./data-contract.js");
const CACHE_PREFIX = "sistema-evidencias-ops-";
const CACHE_NAME = "sistema-evidencias-ops-v51";
const CORE = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./data-contract.js",
  "./pdf-export.js",
  "./xlsx-export.js",
  "./manifest.webmanifest",
  "./assets/icons/icon-64.png",
  "./assets/icons/icon-64.webp",
  "./assets/campaign/lucy-fall.webp",
  "./assets/campaign/snoopy-fall.webp",
  "./assets/campaign/linus-fall.webp",
  "./assets/director/raul-sierra-hero.webp",
  "./assets/director/jorge-alcantar.webp",
  "./assets/about/enrique-cesar.jpeg",
  "./assets/about/jorge-alcantar.png"
];

async function precacheLatest() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(CORE.map(async (path) => {
    const request = new Request(path, { cache: "reload" });
    const response = await fetch(request);
    if (!response.ok || response.redirected) throw new Error(`No se pudo preparar ${path}: ${response.status}`);
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
  if (event.data?.type === "CLEAR_ALL_CACHES") {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(
        keys.filter((key) => key.startsWith(CACHE_PREFIX)).map((key) => caches.delete(key))
      ))
    );
  }
});

async function networkFirst(request, cacheKey = request, dashboard = false) {
  const cache = await caches.open(CACHE_NAME);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(request, { cache: "no-store", signal: controller.signal });
    // Una denegación explícita del servidor no autoriza servir datos guardados.
    if ([401, 403].includes(response.status) || response.redirected) return response;
    if (!response.ok) throw new Error(`Carga HTTP ${response.status}`);
    if (dashboard) {
      const data = await response.clone().json();
      self.OPSDashboard.validate(data);
    }
    // La cuota de caché no debe hacer fallar una descarga válida.
    try { await cache.put(cacheKey, response.clone()); } catch (_error) {}
    return response;
  } catch (error) {
    const cached = await cache.match(cacheKey, { ignoreSearch: true });
    if (cached) {
      if (!dashboard) return cached;
      // Una copia de otra versión o incompleta tampoco puede usarse sin red.
      try { self.OPSDashboard.validate(await cached.clone().json()); }
      catch (_error) { await cache.delete(cacheKey); throw error; }
      const headers = new Headers(cached.headers);
      headers.set("X-OPS-Data-Source", "cache");
      return new Response(cached.body, { status: cached.status, headers });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  const fresh = fetch(request)
    .then(async (response) => {
      if (response.ok && !response.redirected) {
        try { await cache.put(request, response.clone()); } catch (_error) {}
      }
      return response;
    })
    .catch(() => Response.error());
  // Conserva viva la renovación cuando se devuelve una imagen ya guardada.
  if (event) event.waitUntil(fresh.then(() => undefined));
  return cached || await fresh;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/.auth/")) return;

  if (url.pathname.endsWith("/data/dashboard.json")) {
    event.respondWith(networkFirst(event.request, new Request(new URL("./data/dashboard.json", self.location.href)), true));
    return;
  }
  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request, new Request(new URL("./index.html", self.location.href))));
    return;
  }
  if (["script", "style"].includes(event.request.destination)) {
    event.respondWith(networkFirst(event.request));
    return;
  }
  if (["image", "font"].includes(event.request.destination)
    || url.pathname.includes("/exports/")) {
    event.respondWith(staleWhileRevalidate(event.request, event));
  }
});
