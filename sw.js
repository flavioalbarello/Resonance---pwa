const CACHE = "resonance-v46"; // bump di versione: invalida qualunque cache residua e serve il nuovo app.js
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
  "./lib/plasmide.js",
  "./lib/capitolato.js",
  "./lib/alimentare.js",
  // 15/09/2026 — MANCAVA DA QUANDO ESISTE (14/09). app.js lo importa, questo elenco no: la prima
  // apertura SENZA rete dopo un aggiornamento trovava app.js in cache e questo import no, e l'app
  // non si disegnava affatto. Esattamente il guasto descritto qui sopra, in un commento scritto il
  // 31/08 proprio per impedirlo: una regola scritta e basta non e' una regola. Da oggi la impone
  // una prova (tests/service-worker.test.mjs), che confronta questo elenco con gli import veri.
  "./lib/spartito.js",
  "./config.js",
  // 14/09/2026 — il banco microfono. Precaricato perche' la prova si fa in macchina, e un garage o
  // un parcheggio interrato senza campo e' esattamente il posto dove si finisce per provarlo.
  "./prova-voce.html",
  "./vendor/preact.mjs",
  "./vendor/preact-hooks.mjs",
  "./vendor/htm.mjs",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  // index.html lo chiede, quindi senza rete lo chiederebbe alla cache e non lo troverebbe.
  "./icons/apple-touch-icon.png",
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

// ══════════════════════════════════════════════════════════════════════════════════════════════
// IL CORRIERE — 15/09/2026
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Dal Ghost: «così però blocca me a tenere aperta la pagina e mi impedisce di fare altro col
// telefono mentre cerca», e poi: «procedi col service worker, così almeno intanto che fallisce non
// mi incatena a guardarla fallire».
//
// Il problema vero: una chiamata al modello parte dalla PAGINA, e quando Android sospende la pagina
// la chiamata muore. Il Ghost deve restare a guardare uno schermo che non fa niente di visibile,
// per il solo motivo che se guarda altrove il lavoro si perde. Un'app che pretende attenzione per
// non rompersi non è un'estensione di chi la usa: è un padrone.
//
// IL SERVICE WORKER VIVE FUORI DALLA PAGINA. Quando la pagina viene sospesa, lui no — e può
// continuare a fare le chiamate e mettere da parte le risposte. Al ritorno la pagina le trova già lì.
//
// LA REGOLA CHE TIENE PICCOLO QUESTO FILE: il corriere fa il FATTORINO, non il musicista.
// Fa le POST che gli si danno e deposita le risposte GREZZE. Non sa cos'è uno spartito, non conosce
// l'accettore, non estrae niente. Tutta l'intelligenza resta in app.js, dove c'è il banco di prova:
// duplicarla qui vorrebbe dire due copie che divergono entro un mese — è già successo col piano
// alimentare, ed è la ragione per cui `detta` e `verifica` stanno nella stessa riga.
//
// LA CHIAVE API arriva dentro il messaggio e vive solo per la durata della chiamata: non viene
// scritta nel magazzino, non viene messa in cache, non esce da qui se non nell'intestazione
// Authorization verso openrouter.ai. «Una chiave dentro un file che gira è una chiave bruciata».
//
// QUELLO CHE NON POSSO GARANTIRE, e non fingo: il browser ha il diritto di fermare un service
// worker quando vuole. `waitUntil` chiede di restare vivo e di solito basta per una chiamata breve —
// ed è per questo che il tetto di lettura è sceso a 45 secondi — ma non è una promessa che posso
// fare io. Se il corriere viene fermato, il lavoro resta segnato come non finito e la pagina, al
// ritorno, lo dice e lo rifà: peggio di così non va, e comunque non incatena nessuno.
const IDB_NOME = "resonance";
const IDB_LAVORI = "lavori";      // DEVE combaciare con app.js — c'è un banco che lo verifica
const IDB_VERSIONE = 2;

function apriMagazzino() {
  return new Promise((risolvi, rifiuta) => {
    let r;
    try { r = indexedDB.open(IDB_NOME, IDB_VERSIONE); } catch (e) { return rifiuta(e); }
    r.onupgradeneeded = () => {
      // Si creano TUTTI i negozi, non solo il proprio: chi arriva primo alla versione 2 fa
      // l'aggiornamento per entrambi, e il secondo non deve trovarsi una metà di magazzino.
      for (const nome of ["testi-documenti", IDB_LAVORI]) {
        try { r.result.createObjectStore(nome); } catch { /* già c'è */ }
      }
    };
    r.onsuccess = () => risolvi(r.result);
    r.onerror = () => rifiuta(r.error || new Error("apertura fallita"));
  });
}

function deposita(id, valore) {
  return apriMagazzino().then((db) => new Promise((risolvi, rifiuta) => {
    const tx = db.transaction([IDB_LAVORI], "readwrite");
    tx.objectStore(IDB_LAVORI).put(valore, id);
    tx.oncomplete = () => risolvi(true);
    tx.onerror = () => rifiuta(tx.error);
    tx.onabort = () => rifiuta(tx.error);
  }));
}

async function avvisaLePagine(messaggio) {
  const pagine = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
  for (const p of pagine) { try { p.postMessage(messaggio); } catch { /* una pagina morta non è un guasto */ } }
}

// Una POST sola, col suo tetto. Un fallimento non è un'eccezione da propagare: è un esito, e va
// depositato insieme agli altri — se buttassi via il motivo, la pagina al ritorno troverebbe un
// buco senza sapere perché.
async function unaChiamata({ url, chiave, corpo, tetto }) {
  const controller = new AbortController();
  const taglia = setTimeout(() => controller.abort(), Number(tetto) || 45000);
  const t0 = Date.now();
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${chiave}` },
      body: JSON.stringify(corpo),
      signal: controller.signal,
    });
    return { ok: true, ms: Date.now() - t0, dati: await r.json() };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, errore: e?.name === "AbortError" ? "tempo scaduto" : (e?.message || "chiamata fallita") };
  } finally { clearTimeout(taglia); }
}

self.addEventListener("message", (e) => {
  const m = e.data;
  if (!m || m.tipo !== "lavoro") return;
  const { id, chiamate, chiave, tetto } = m;
  if (!id || !Array.isArray(chiamate) || !chiamate.length || !chiave) return;
  // waitUntil: è la richiesta di restare vivo fino alla fine. Senza, il browser può fermare il
  // worker appena il gestore ritorna — cioè subito, perché il lavoro è asincrono.
  e.waitUntil((async () => {
    try {
      await deposita(id, { stato: "in-corso", avviato: Date.now(), quante: chiamate.length });
      // TUTTE INSIEME, come in pagina: il tempo è quello della più lenta, non della somma.
      const risposte = await Promise.all(chiamate.map((c) => unaChiamata({ ...c, chiave, tetto })));
      await deposita(id, { stato: "finito", finito: Date.now(), risposte });
      await avvisaLePagine({ tipo: "lavoro-finito", id });
    } catch (err) {
      try { await deposita(id, { stato: "errore", finito: Date.now(), errore: String(err?.message || err) }); } catch { /* magazzino non disponibile */ }
      await avvisaLePagine({ tipo: "lavoro-finito", id });
    }
  })());
});
