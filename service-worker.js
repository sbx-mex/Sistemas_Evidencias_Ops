const CACHE_PREFIX = "sistema-evidencias-ops-";
const CACHE_NAME = "sistema-evidencias-ops-v27";
const CORE = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./assets/icons/icon-64.png",
  "./assets/icons/icon-64.webp",
  "./assets/campaign/fall-peanuts-card.webp",
  "./assets/campaign/fall-peanuts-footer.webp",
  "./assets/director/raul-sierra.webp",
  "./assets/director/jorge-alcantar.webp"
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
  if (event.data?.type === "CLEAR_ALL_CACHES") {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(
        keys.filter((key) => key.startsWith(CACHE_PREFIX)).map((key) => caches.delete(key))
      ))
    );
  }
});

async function networkFirst(request, cacheKey = request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok) await cache.put(cacheKey, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(cacheKey, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  const fresh = fetch(request)
    .then(async (response) => {
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || fresh || Response.error();
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith("/data/dashboard.json")) {
    event.respondWith(networkFirst(event.request, new Request(new URL("./data/dashboard.json", self.location.href))));
    return;
  }
  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request, new Request(new URL("./index.html", self.location.href))));
    return;
  }
  if (["script", "style", "image", "font"].includes(event.request.destination)
    || url.pathname.includes("/exports/")) {
    event.respondWith(staleWhileRevalidate(event.request));
  }
});
