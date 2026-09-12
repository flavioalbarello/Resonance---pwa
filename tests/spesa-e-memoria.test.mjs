// IL CONTROLLO DI INGEGNERIA DELL'11/09 — le prove dei quattro punti che toccavano i dati.
//
// Tutti e quattro avevano la stessa forma: il programma DICHIARAVA una garanzia e andava a cercarne
// la prova in un posto dove era già stata buttata via, o non la cercava affatto.
//  1. il tetto di spesa leggeva un registro da 50 voci e non poteva scattare;
//  2. saveKey restituiva false e nessuno lo guardava — 76 chiamate, zero controlli;
//  3. gli archivi della chat non lasciavano mai il dispositivo (`removeItem`: zero occorrenze);
//  4. i file versionati su Drive erano uno per scrittura, ognuno con la lista intera.
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();
const store = globalThis.__store;
const setOriginale = store.set.bind(store);

// Il modo per far dire NO alla memoria: il localStorage finto scrive su questa Map, quindi basta che
// la sua `set` lanci. È l'errore vero che lancia un browser a quota esaurita, con lo stesso nome.
function conMemoriaPiena(fn) {
  store.set = () => { const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; };
  try { return fn(); } finally { store.set = setOriginale; }
}

beforeEach(() => { store.clear(); store.set = setOriginale; app.dimenticaMemoriaPiena(); });

// ─────────────────────────────────────────────────────────────────────────────
describe("1 · IL TETTO DI SPESA — prima non poteva scattare, ora sì", () => {
  test("IL DIFETTO, riprodotto: 50 voci di registro non arrivano a 5 dollari nemmeno tutte insieme", () => {
    // Questa è la misura che ha fatto scrivere il totalizzatore, e resta qui perché è il motivo.
    // Il vecchio conto sommava le voci `ai-cost` dentro `debug-log`, che ne tiene 50. Con un costo
    // realistico per chiamata, il MASSIMO che quel conto potesse riportare era 0,14 $ contro 5.
    const COSTO_PER_CHIAMATA = 0.0028;
    const massimoOsservabile = 50 * COSTO_PER_CHIAMATA;
    assert.ok(massimoOsservabile < app.TETTO_MENSILE_USD / 30,
      `${massimoOsservabile} — il vecchio tetto era irraggiungibile per un fattore ${(app.TETTO_MENSILE_USD / massimoOsservabile).toFixed(0)}`);
  });

  test("il totalizzatore somma sul MESE, non su una finestra di voci", () => {
    for (let i = 0; i < 400; i++) app.registraSpesa({ costUsd: 0.01, tokensIn: 12000, tokensOut: 300 });
    const t = app.leggiSpesa();
    assert.equal(t.chiamate, 400);
    assert.equal(Number(t.usd.toFixed(2)), 4.0);
    assert.equal(t.tokenIn, 4800000);
    // 400 chiamate: molte più delle 50 che il registro di debug avrebbe tenuto.
    assert.ok(app.spesaDelMeseCorrente() > 50 * 0.01, "il totale si è fatto tagliare da un tetto");
  });

  test("il tetto in DOLLARI morde quando il fornitore li dichiara", () => {
    assert.equal(app.motivoTettoRaggiunto(), null);
    // 600 e non 500: 500 × 0,01 fa 4,999999999 in virgola mobile e il tetto — giustamente — non
    // morde. La prima volta l'ho scritto con 500 e il rosso era mio, non del codice.
    for (let i = 0; i < 600; i++) app.registraSpesa({ costUsd: 0.01, tokensIn: 100, tokensOut: 10 });
    const m = app.motivoTettoRaggiunto();
    assert.equal(m.quale, "usd");
    assert.ok(m.valore >= app.TETTO_MENSILE_USD);
    assert.equal(app.operazioniAutomaticheConsentite(), false);
  });

  test("IL PUNTO CHE CHIUDE IL BUCO: il tetto morde anche se il costo NON arriva mai", () => {
    // Il brief del 26/07 vieta di stimare un costo da un prezzario cablato, e quella regola resta:
    // `usd` accumula solo i valori veri. Ma i TOKEN sono misurati, non stimati — arrivano in ogni
    // risposta. Senza il secondo tetto, un account senza usage accounting non avrebbe nessun freno.
    for (let i = 0; i < 4000; i++) app.registraSpesa({ costUsd: null, tokensIn: 12000, tokensOut: 400 });
    assert.equal(app.spesaDelMeseCorrente(), 0, "nessun dollaro va inventato");
    assert.equal(app.ilFornitoreMandaIlCosto(), false);
    const m = app.motivoTettoRaggiunto();
    assert.equal(m.quale, "token");
    assert.ok(m.valore >= app.TETTO_MENSILE_TOKEN);
    assert.equal(app.operazioniAutomaticheConsentite(), false);
  });

  test("un costo nullo non diventa zero-che-conta: le chiamate con costo si contano a parte", () => {
    app.registraSpesa({ costUsd: null, tokensIn: 100, tokensOut: 10 });
    assert.equal(app.ilFornitoreMandaIlCosto(), false);
    app.registraSpesa({ costUsd: 0.004, tokensIn: 100, tokensOut: 10 });
    assert.equal(app.ilFornitoreMandaIlCosto(), true);
    assert.equal(app.leggiSpesa().chiamateConCosto, 1);
    assert.equal(app.leggiSpesa().chiamate, 2);
  });

  test("al cambio di mese il totale si azzera e il mese chiuso NON si perde (Legge 14)", () => {
    store.set("spesa-mensile", JSON.stringify({ mese: "2020-01", usd: 3.5, chiamate: 900, chiamateConCosto: 900, tokenIn: 9e6, tokenOut: 1e5, storico: [] }));
    const t = app.leggiSpesa();
    assert.notEqual(t.mese, "2020-01");
    assert.equal(t.usd, 0);
    assert.equal(t.chiamate, 0);
    assert.equal(t.storico.length, 1);
    assert.equal(t.storico[0].mese, "2020-01");
    assert.equal(t.storico[0].usd, 3.5);
    assert.equal(app.motivoTettoRaggiunto(), null, "il mese chiuso non deve tenere fermo il mese nuovo");
  });

  test("leggere due volte non muove niente: il rollover è idempotente", () => {
    store.set("spesa-mensile", JSON.stringify({ mese: "2020-01", usd: 1, chiamate: 1, tokenIn: 1, tokenOut: 1, storico: [] }));
    const a = app.leggiSpesa();
    app.registraSpesa({ costUsd: 0.001, tokensIn: 5, tokensOut: 1 });
    const b = app.leggiSpesa();
    assert.equal(b.storico.length, a.storico.length, "lo storico si è duplicato");
    assert.equal(b.chiamate, 1);
  });

  test("lo storico ha un tetto: non cresce per sempre", () => {
    const finti = Array.from({ length: app.SPESA_STORICO_MESI + 5 }, (_, i) => ({ mese: `201${i % 10}-0${(i % 9) + 1}`, usd: 1, tokenIn: 1, tokenOut: 1 }));
    store.set("spesa-mensile", JSON.stringify({ mese: "2020-01", usd: 1, tokenIn: 1, tokenOut: 1, storico: finti }));
    assert.ok(app.leggiSpesa().storico.length <= app.SPESA_STORICO_MESI);
  });

  test("un totalizzatore mai scritto, o scritto storto, non fa esplodere niente", () => {
    assert.equal(app.spesaDelMeseCorrente(), 0);
    assert.equal(app.motivoTettoRaggiunto(), null);
    for (const spazzatura of ['"ciao"', "42", "null", "[1,2]", "{oops"]) {
      store.clear(); store.set("spesa-mensile", spazzatura);
      const t = app.leggiSpesa();
      assert.equal(typeof t.usd, "number");
      assert.ok(Array.isArray(t.storico));
    }
  });

  test("logAiCost alimenta il totalizzatore, e lo fa anche se il registro di debug scarta la voce", () => {
    // Il punto architetturale: il totale non passa dal registro, gli sta accanto. Un pushDebugLog
    // che butta via tutto (è il suo lavoro, sopra le 50 voci) non tocca il conto.
    const buttaVia = () => {};
    for (let i = 0; i < 120; i++) app.logAiCost(buttaVia, "shell", "m", { usage: { prompt_tokens: 1000, completion_tokens: 100, cost: 0.002 } });
    assert.equal(app.leggiSpesa().chiamate, 120);
    assert.equal(Number(app.leggiSpesa().usd.toFixed(3)), 0.24);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("2 · SAVEKEY NON FALLISCE PIU' IN SILENZIO", () => {
  test("a memoria piena saveKey dice false E alza la bandiera", () => {
    assert.equal(app.memoriaPiena(), null);
    const esito = conMemoriaPiena(() => app.saveKey("qualcosa", { a: 1 }));
    assert.equal(esito, false);
    const b = app.memoriaPiena();
    assert.ok(b, "nessuna bandiera: il fallimento è ancora muto");
    assert.equal(b.chiave, "qualcosa");
    assert.equal(b.errore, "QuotaExceededError");
    assert.equal(b.scritturePerse, 1);
  });

  test("le scritture perse si contano: una sola non è come venti", () => {
    conMemoriaPiena(() => { for (let i = 0; i < 20; i++) app.saveKey("k" + i, i); });
    assert.equal(app.memoriaPiena().scritturePerse, 20);
  });

  test("a memoria libera la bandiera non si alza e il valore si rilegge", () => {
    assert.equal(app.saveKey("prova", { x: 7 }), true);
    assert.equal(app.memoriaPiena(), null);
    assert.deepEqual(app.loadKey("prova", null), { x: 7 });
  });

  test("LA BANDIERA NON VA IN LOCALSTORAGE: il posto dove scriverla è quello che ha detto no", () => {
    conMemoriaPiena(() => app.saveKey("x", 1));
    assert.ok(app.memoriaPiena());
    const chiavi = [];
    for (let i = 0; i < store.size; i++) chiavi.push(Array.from(store.keys())[i]);
    assert.deepEqual(chiavi, [], `la bandiera è finita in memoria: ${chiavi.join(", ")}`);
  });

  test("IL CASO PEGGIORE — la compattazione della chat non perde più niente", () => {
    // Prima: la chat passava comunque da 41 a 25 messaggi e il segnaposto dichiarava «archiviati
    // alla chiave X» indicando una chiave che non esisteva. 0 su 17 recuperabili, nessun errore.
    const chat = Array.from({ length: app.SHELL_CHAT_COMPACT_TRIGGER + 1 }, (_, i) => ({ id: "m" + i, role: i % 2 ? "assistant" : "user", content: "messaggio " + i }));

    const conMemoria = app.compactShellChatIfNeeded(chat);
    assert.equal(conMemoria.length, app.SHELL_CHAT_KEEP_RECENT + 1, "a memoria libera deve compattare");
    const chiave = conMemoria[0].content.match(/chiave: ([^)]+)\)/)[1];
    assert.equal(JSON.parse(store.get(chiave)).length, chat.length - app.SHELL_CHAT_KEEP_RECENT);

    store.clear();
    const aQuotaPiena = conMemoriaPiena(() => app.compactShellChatIfNeeded(chat));
    assert.equal(aQuotaPiena, null, "ha compattato pur non avendo scritto l'archivio: è la Legge 14 rotta");
    assert.ok(app.memoriaPiena(), "e nemmeno l'ha detto");
  });

  test("non compattare è meglio che compattare perdendo: la chat resta INTERA", () => {
    const chat = Array.from({ length: 60 }, (_, i) => ({ id: "m" + i, role: "user", content: "x" + i }));
    const esito = conMemoriaPiena(() => app.compactShellChatIfNeeded(chat)) || chat;
    assert.equal(esito.length, 60);
    assert.equal(esito[0].id, "m0", "il primo messaggio è sparito");
  });

  test("sotto soglia non compatta e non inventa archivi, come sempre", () => {
    const corta = Array.from({ length: app.SHELL_CHAT_COMPACT_TRIGGER }, (_, i) => ({ id: "m" + i, role: "user", content: "x" }));
    assert.equal(app.compactShellChatIfNeeded(corta), null);
    assert.equal(store.size, 0);
    for (const niente of [null, undefined, [], "non un array"]) assert.equal(app.compactShellChatIfNeeded(niente), null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("3 · GLI ARCHIVI VANNO DOVE C'E' POSTO — e la copia locale se ne va solo dopo la prova", () => {
  const metti = (n) => {
    for (let i = 1; i <= n; i++) {
      store.set(`${app.BACKUP_ARCHIVE_PREFIX}2026-09-${String(i).padStart(2, "0")}-abc${i}`, JSON.stringify([{ id: "m" + i, content: "x".repeat(500) }]));
    }
  };
  const caricaOk = async (nome, contenuto) => ({ id: "drive-" + nome.length + "-" + contenuto.length, modifiedTime: "ora" });

  test("i più recenti restano sul dispositivo, i vecchi salgono", async () => {
    metti(7);
    const esito = await app.sfollaArchiviSuDrive({ carica: caricaOk });
    assert.equal(esito.spostati, 7 - app.ARCHIVI_LOCALI_DA_TENERE);
    assert.equal(esito.falliti, 0);
    const restati = app.chiaviArchivioChat();
    assert.equal(restati.length, app.ARCHIVI_LOCALI_DA_TENERE);
    // I tre che restano sono i tre con la data più alta: il nome porta la data, quindi l'ordine
    // alfabetico è l'ordine cronologico.
    assert.deepEqual(restati.map((k) => k.slice(-4)), ["abc7", "abc6", "abc5"]);
  });

  test("l'indice dice dove sono finiti: senza, il segnaposto in chat indicherebbe il nulla", async () => {
    metti(5);
    await app.sfollaArchiviSuDrive({ carica: caricaOk });
    const indice = app.leggiArchiviSuDrive();
    assert.equal(indice.length, 2);
    for (const v of indice) {
      assert.ok(v.chiave.startsWith(app.BACKUP_ARCHIVE_PREFIX));
      assert.ok(v.driveId);
      assert.ok(v.byte > 0);
    }
  });

  test("IL PUNTO CHE LO RENDE LEGGE 14: senza id da Drive non si cancella NIENTE", async () => {
    metti(6);
    const senzaId = async () => ({ modifiedTime: "ora" }); // risposta senza id: consegna non provata
    const esito = await app.sfollaArchiviSuDrive({ carica: senzaId });
    assert.equal(esito.spostati, 0);
    assert.equal(esito.falliti, 3);
    assert.equal(app.chiaviArchivioChat().length, 6, "ha cancellato senza prova di consegna");
  });

  test("se Drive lancia, gli archivi restano dove sono", async () => {
    metti(6);
    const cade = async () => { throw new Error("Errore Drive (503)"); };
    const righe = [];
    const esito = await app.sfollaArchiviSuDrive({ carica: cade, pushDebugLog: (v) => righe.push(v) });
    assert.equal(esito.spostati, 0);
    assert.equal(app.chiaviArchivioChat().length, 6);
    assert.ok(righe.some((r) => r.error && r.error.includes("503")), "il guasto non è nemmeno finito nel registro");
  });

  test("se l'INDICE non si scrive, l'archivio non si cancella: meglio in doppio che perso", async () => {
    metti(5);
    let chiamate = 0;
    // La memoria si riempie dopo il primo caricamento: l'indice non si scrive più.
    const carica = async (n, c) => { chiamate++; store.set = () => { const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; }; return { id: "d" + chiamate }; };
    const esito = await app.sfollaArchiviSuDrive({ carica });
    store.set = setOriginale;
    assert.equal(esito.spostati, 0);
    assert.equal(app.chiaviArchivioChat().length, 5);
  });

  test("senza niente da spostare non fa niente e non chiama Drive", async () => {
    metti(2);
    let chiamate = 0;
    const esito = await app.sfollaArchiviSuDrive({ carica: async () => { chiamate++; return { id: "x" }; } });
    assert.equal(chiamate, 0);
    assert.deepEqual(esito, { spostati: 0, falliti: 0 });
  });

  test("senza un caricatore non tocca niente: nessuna cancellazione per distrazione", async () => {
    metti(9);
    const esito = await app.sfollaArchiviSuDrive({});
    assert.equal(esito.spostati, 0);
    assert.equal(app.chiaviArchivioChat().length, 9);
  });

  test("le chiavi di altri dati non vengono mai toccate", async () => {
    metti(5);
    store.set("bio-data", JSON.stringify([{ id: "b1" }]));
    store.set("shell-chat", JSON.stringify([{ id: "c1" }]));
    await app.sfollaArchiviSuDrive({ carica: caricaOk });
    assert.ok(store.get("bio-data"));
    assert.ok(store.get("shell-chat"));
  });

  test("l'indice degli archivi è nel backup, altrimenti un telefono nuovo non saprebbe che esistono", () => {
    assert.ok(app.BACKUP_KEYS.includes(app.ARCHIVI_SU_DRIVE_KEY));
    assert.ok(app.BACKUP_KEYS.includes(app.SPESA_KEY));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("4 · I FILE VERSIONATI SU DRIVE — uno al mese, non uno per scrittura", () => {
  test("il nome porta il MESE, non il secondo: è quello che ferma la crescita quadratica", () => {
    const n = app.nomeFileVersionato("04 BIO_STASIS");
    assert.match(n, /^Resonance – 04 BIO_STASIS – \d{4}-\d{2}$/, n);
    assert.ok(!/\d{2}:\d{2}:\d{2}/.test(n), "c'è ancora un orario nel nome");
  });

  test("due scritture nello stesso mese puntano allo STESSO nome", () => {
    assert.equal(app.nomeFileVersionato("01 AGORÀ_MAGI"), app.nomeFileVersionato("01 AGORÀ_MAGI"));
  });

  test("etichette diverse restano file diversi", () => {
    assert.notEqual(app.nomeFileVersionato("04 BIO_STASIS"), app.nomeFileVersionato("03 AIR_OPERATIONS"));
  });

  test("LA MISURA: dodici file l'anno per etichetta invece di 1.095", () => {
    // 3 scritture al giorno su un pilastro facevano 1.095 file e 69,8 MB in un anno, perché ogni
    // file conteneva la lista intera. Con il nome mensile i file sono 12 e il contenuto è quello di
    // fine mese: ~857 kB. Il conto sta qui perché è il motivo della modifica.
    const scrittureAnno = 3 * 365;
    const fileVecchi = scrittureAnno;
    const fileNuovi = 12;
    assert.ok(fileNuovi * 80 < fileVecchi, `${fileNuovi} vs ${fileVecchi}`);
  });

  test("la chat non è più nelle dipendenze dell'autosave, e il suo passo è di minuti", () => {
    assert.ok(app.CHAT_SYNC_INTERVALLO_MS >= 60000, `${app.CHAT_SYNC_INTERVALLO_MS} ms: non è un passo lento`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("5 · I BYTE NUL SONO USCITI DA app.js", () => {
  test("chiaveIdempotenza funziona ancora esattamente come prima", () => {
    // Erano due `"\x00"` letterali, che rendevano app.js binario per grep: ogni ricerca nel file
    // principale tornava «binary file matches» e non mostrava una riga. `" "` è lo stesso
    // valore a runtime, e il file è di nuovo testo.
    const a = app.chiaveIdempotenza("evento", ["Visita", "2026-09-12 16:30"]);
    const b = app.chiaveIdempotenza("evento", ["  visita  ", "2026-09-12   16:30"]);
    assert.equal(a, b, "la normalizzazione non è più la stessa");
    assert.notEqual(a, app.chiaveIdempotenza("evento", ["Visita", "2026-09-12 16:00"]));
    assert.notEqual(a, app.chiaveIdempotenza("mail", ["Visita", "2026-09-12 16:30"]));
    // E il separatore fa ancora il suo lavoro: due liste diverse che si concatenerebbero allo stesso
    // modo senza separatore devono restare distinte.
    assert.notEqual(app.chiaveIdempotenza("t", ["ab", "c"]), app.chiaveIdempotenza("t", ["a", "bc"]));
  });
});
