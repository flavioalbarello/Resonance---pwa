const CACHE = "resonance-v4"; // bump di versione: invalida qualunque cache residua e serve il nuovo app.js
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./config.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Network-first per la shell locale (un nuovo deploy è sempre visibile subito), con fallback alla
// cache solo se offline. Le chiamate a origini esterne (Google Drive, OpenRouter, CDN) NON vengono
// mai intercettate: passano dirette alla rete, senza cache. Questo è deliberato — cachare risposte
// di API autenticate causerebbe "successi" fasulli letti dalla cache invece che dal server.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  const isExternal = url.origin !== self.location.origin;
  if (isExternal) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
