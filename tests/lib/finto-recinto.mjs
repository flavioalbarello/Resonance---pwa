// Un recinto finto per Node, che fa girare L'INVOLUCRO VERO — 04/09/2026.
// RIFATTO IL 09/09/2026 SU `node:vm`, e il motivo è il difetto che questa riscrittura corregge.
//
// Perché non basta un finto qualsiasi. Il recinto è la parte dell'accettore che ha i denti: se in
// prova lo sostituissi con "esegui la funzione e vedi cosa esce", proverei il ciclo del generatore
// SENZA la cosa che lo rende onesto. Quindi qui non si simula il recinto: si simulano solo `Worker`,
// `Blob` e `URL.createObjectURL`, cioè le tre cose che Node non ha, e dentro ci gira la stringa
// INVOLUCRO_SANDBOX di app.js, parola per parola, chiusura dei nomi di rete compresa.
//
// ── PERCHÉ LA PRIMA VERSIONE NON POTEVA PROVARE LA CHIUSURA (09/09/2026) ────────────────────────
// La prima versione dava all'involucro un `self` che era un OGGETTO NORMALE. In un Worker vero
// `self` È l'oggetto globale: cancellarne una proprietà toglie il nome dallo scope globale, e uno
// strumento che scrive `fetch(...)` non lo trova più. Su un oggetto normale non succede niente del
// genere — lo strumento viene eseguito con `(0, eval)`, cioè eval INDIRETTO, che risolve nello
// scope GLOBALE del processo. Misurato prima di riscrivere:
//     const self = { fetch(){} }; delete self.fetch;
//     (0, eval)("(() => typeof fetch)")()   →   "function"     ← il fetch DI NODE, vivo e vegeto
// Quindi una prova comportamentale scritta contro quel finto avrebbe misurato il fetch di Node,
// non la chiusura dell'involucro: sarebbe stata verde per la ragione sbagliata. Esattamente il
// difetto che il report del 09/09 chiama «una copertura che sembra esserci e non c'è».
//
// La correzione: un contesto `node:vm`, dove `self` viene fatto puntare al globale DI QUEL
// CONTESTO. Così `delete self.fetch` toglie davvero il nome, l'eval indiretto dell'involucro
// risolve lì dentro, e la chiusura si può provare per quello che fa invece che per come è scritta.
// `node:vm` è un modulo incorporato in Node, come `node:fs` che build-testable usa già: nessuna
// dipendenza nuova.
//
// Cosa questo NON prova, e va detto: il tetto di tempo su un ciclo infinito. Un ciclo che non finisce
// qui bloccherebbe il processo di prova invece di essere ucciso, perché non c'è un thread separato da
// terminare. Quella proprietà è già misurata dove conta (nel browser vero: 801ms su un tetto di 800),
// e non si finge qui.
import vm from "node:vm";

const BLOB = new Map();

// I nomi che un Worker vero espone e che l'involucro deve chiudere. Messi qui come VALORI VIVI e
// plausibili — non come `undefined` — altrimenti la prova non distinguerebbe "chiuso dall'involucro"
// da "non c'è mai stato", che è la differenza che stiamo cercando di misurare.
function nomiVividiUnWorker() {
  return {
    fetch: () => Promise.resolve({ ok: true }),
    XMLHttpRequest: class XMLHttpRequest {},
    WebSocket: class WebSocket {},
    EventSource: class EventSource {},
    importScripts: () => {},
    indexedDB: { open: () => ({}) },
    caches: { open: () => ({}) },
    Notification: class Notification {},
    BroadcastChannel: class BroadcastChannel {},
    SharedWorker: class SharedWorker {},
    Worker: class Worker {},
  };
}

export function installaFintoRecinto() {
  const precedenti = { Worker: globalThis.Worker, Blob: globalThis.Blob, crea: URL.createObjectURL, revoca: URL.revokeObjectURL };

  globalThis.Blob = class FintoBlob {
    constructor(parti) { this.sorgente = (parti || []).join(""); }
  };
  URL.createObjectURL = (blob) => {
    const url = `blob:finto/${BLOB.size}-${Math.random().toString(16).slice(2)}`;
    BLOB.set(url, blob.sorgente);
    return url;
  };
  URL.revokeObjectURL = (url) => { BLOB.delete(url); };

  globalThis.Worker = class FintoWorker {
    constructor(url) {
      const sorgente = BLOB.get(url);
      if (sorgente === undefined) throw new Error("blob sconosciuto");
      this.onmessage = null;
      this.onerror = null;
      this.morto = false;

      // Il contesto: un globale suo, dove `self` è il globale stesso — come in un Worker vero.
      const contesto = vm.createContext({ ...nomiVividiUnWorker() });
      vm.runInContext("globalThis.self = globalThis;", contesto);
      contesto.postMessage = (dati) => { if (!this.morto) queueMicrotask(() => this.onmessage?.({ data: dati })); };
      this.contesto = contesto;

      // La stringa VERA di produzione, eseguita dentro quel globale.
      vm.runInContext(sorgente, contesto, { filename: "involucro-sandbox.js" });
    }
    postMessage(dati) {
      if (this.morto) return;
      try {
        // I dati attraversano il confine del contesto: si ricreano al suo interno, com'è per un
        // Worker vero (structured clone). Senza questo passaggio lo strumento riceverebbe oggetti
        // nati in un altro realm, e un `instanceof` si comporterebbe diversamente dal browser.
        const dentro = vm.runInContext(`(${JSON.stringify(JSON.stringify(dati))})`, this.contesto);
        this.contesto.self.onmessage({ data: JSON.parse(dentro) });
      } catch (e) {
        queueMicrotask(() => this.onerror?.({ message: String(e?.message || e) }));
      }
    }
    terminate() { this.morto = true; }
  };

  return function disinstalla() {
    globalThis.Worker = precedenti.Worker;
    globalThis.Blob = precedenti.Blob;
    URL.createObjectURL = precedenti.crea;
    URL.revokeObjectURL = precedenti.revoca;
    BLOB.clear();
  };
}

// Fa entrare un solo strumento nel recinto e restituisce l'esito grezzo dell'involucro.
// Serve alle prove che guardano il RECINTO invece che il generatore: nessun plasmide, nessun
// capitolato, solo codice e casi.
export function nelRecinto(INVOLUCRO, codice, casi) {
  const url = URL.createObjectURL(new Blob([INVOLUCRO], { type: "text/javascript" }));
  const w = new Worker(url);
  return new Promise((risolvi) => {
    w.onmessage = (e) => { w.terminate(); URL.revokeObjectURL(url); risolvi(e.data); };
    w.onerror = (e) => { w.terminate(); URL.revokeObjectURL(url); risolvi({ ok: false, errore: e.message }); };
    w.postMessage({ codice, casi });
  });
}
