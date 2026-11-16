// Offline support. With no connection (a power outage, a dead zone, no data left), the page still opens
// and still lists the shelters and their hours from the last visit.
//
// Network first: a connected visitor always gets the newest files, and each one is saved as it arrives.
// The saved copy is used only when the network does not answer. So this can never serve a stale mix to someone online.
// Only our own files and the map libraries are saved. Map images, routes, address search and weather always need a connection.
//
// Each file is saved under its address WITHOUT the "?..." part, so there is exactly one copy of it: the newest.
// (An earlier version saved "/?sim=smoke" and "/" as separate pages, and offline the oldest one could come back.)
const CACHE = "shelters-v2";
const SHELL = [
  "./", "places.js", "boundary.js", "finder.js", "manifest.webmanifest", "icon.svg", "qr.svg",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css", "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
];
const keyOf = (url) => url.origin + url.pathname;

self.addEventListener("install", (e) => e.waitUntil(
  caches.open(CACHE)
    .then((c) => Promise.all(SHELL.map((path) => fetch(path).then((res) => res.ok && c.put(keyOf(new URL(path, location.href)), res)))))
    .then(() => self.skipWaiting())
));
// Drop the older page caches. The saved county map lives in its own cache ("shelters-map-...") and is left alone.
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => /^shelters-v\d+$/.test(k) && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim())
));

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || (url.origin !== location.origin && url.hostname !== "unpkg.com")) return;
  if (url.pathname.endsWith(".pmtiles")) return; // the 11 MB county map: saved once by the page, only when the person asks
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(keyOf(url), copy)); }
        return res;
      })
      .catch(() => caches.match(keyOf(url)))
  );
});
