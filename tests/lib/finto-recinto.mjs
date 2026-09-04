// Un recinto finto per Node, che fa girare L'INVOLUCRO VERO — 04/09/2026.
//
// Perché non basta un finto qualsiasi. Il recinto è la parte dell'accettore che ha i denti: se in
// prova lo sostituissi con "esegui la funzione e vedi cosa esce", proverei il ciclo del generatore
// SENZA la cosa che lo rende onesto. Quindi qui non si simula il recinto: si simulano solo `Worker`,
// `Blob` e `URL.createObjectURL`, cioè le tre cose che Node non ha, e dentro ci gira la stringa
// INVOLUCRO_SANDBOX di app.js, parola per parola — chiusura dei nomi di rete compresa.
//
// Cosa questo NON prova, e va detto: il tetto di tempo su un ciclo infinito. Un ciclo che non finisce
// qui bloccherebbe il processo di prova invece di essere ucciso, perché non c'è un thread separato da
// terminare. Quella proprietà è già misurata dove conta (nel browser vero: 801ms su un tetto di 800),
// e non si finge qui.
const BLOB = new Map();

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
      // `self` finto: l'involucro vero ci cancella sopra fetch, Worker, indexedDB… e poi ci attacca
      // il proprio onmessage. Gli si dà davvero i nomi da chiudere, altrimenti la parte che li chiude
      // girerebbe a vuoto e la prova non direbbe niente.
      const self = {
        fetch: () => {}, XMLHttpRequest: class {}, WebSocket: class {}, EventSource: class {},
        importScripts: () => {}, indexedDB: {}, caches: {}, Notification: class {},
        BroadcastChannel: class {}, SharedWorker: class {}, Worker: class {},
        onmessage: null,
        postMessage: (dati) => { if (!this.morto) queueMicrotask(() => this.onmessage?.({ data: dati })); },
      };
      this.self = self;
      // eslint-disable-next-line no-new-func — è il punto: si esegue la stringa vera di produzione.
      new Function("self", sorgente)(self);
    }
    postMessage(dati) {
      if (this.morto) return;
      try { this.self.onmessage({ data: dati }); }
      catch (e) { queueMicrotask(() => this.onerror?.({ message: String(e?.message || e) })); }
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
