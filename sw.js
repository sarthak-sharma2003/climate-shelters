// Offline support. With no connection (a power outage, a dead zone, no data left), the page still opens
// and still lists the shelters and their hours from the last visit.
//
// Network first: a connected visitor always gets the newest files, and each one is saved as it arrives.
// The saved copy is used only when the network does not answer. So this can never serve a stale mix to someone online.
// Only our own files and the map library are saved. Map images, routes, address search and weather always need a connection.
const CACHE = "shelters-v1";
const SHELL = [
  "./", "places.js", "boundary.js", "finder.js", "manifest.webmanifest", "icon.svg", "qr.svg",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css", "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
];

self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || (url.origin !== location.origin && url.hostname !== "unpkg.com")) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      // ignoreSearch: "places.js?v=11" and "/?need=heat" fall back to the saved "places.js" and "/".
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
