const CACHE = "resonance-v9"; // bump di versione: invalida qualunque cache residua e serve il nuovo app.js
// 31/08/2026 — I TRE MODULI ESTRATTI DEVONO STARE QUI DENTRO. app.js non e' piu' un file solo: se
// lib/*.js non fosse precaricato, online non cambierebbe niente (la strategia e' rete-prima), ma la
// prima apertura SENZA rete dopo un aggiornamento troverebbe app.js in cache e i suoi import no —
// e l'app non si disegnerebbe affatto, con tutti i dati gia' sul dispositivo. E' esattamente il
// guasto che il vendoring di Preact era servito a togliere di mezzo: non va reintrodotto adesso.
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./lib/base.js",
  "./lib/misure.js",
  "./lib/griglia.js",
  "./lib/alimentare.js",
  "./config.js",
  "./vendor/preact.mjs",
  "./vendor/preact-hooks.mjs",
  "./vendor/htm.mjs",
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
