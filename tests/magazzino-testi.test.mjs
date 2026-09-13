// I TESTI DEI DOCUMENTI ESCONO DA LOCALSTORAGE — 13/09/2026.
//
// localStorage ha un tetto di ~5 MB: misurato, ~1.075 documenti da 4.000 caratteri. IndexedDB non
// ce l'ha. Non è un rinvio — il tetto smette di essere raggiungibile da chi scrive testo.
//
// LE TRE COSE CHE QUESTO FILE DIFENDE, in ordine di quanto farebbero male se si rompessero:
//  1. IL BACKUP. Se i testi escono da localStorage e il backup continua a leggere solo lì, il file
//     scaricato SEMBRA completo — stesse chiavi, stesso numero di voci — e non contiene più il
//     lavoro del Ghost. È il difetto peggiore possibile qui, ed è silenzioso.
//  2. NIENTE SI TOGLIE SENZA UNA PROVA DI CONSEGNA. Il testo lascia localStorage solo dopo che il
//     magazzino l'ha riletto identico. Stessa regola degli archivi della chat.
//  3. SE IL MAGAZZINO NON C'E', tutto resta come prima. Un magazzino che non si apre non deve
//     togliere una funzione: deve solo riportare il tetto di ieri.
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();
const store = globalThis.__store;
const attendi = () => new Promise((r) => setTimeout(r, 30)); // la catena di salvaPercorsi non si aspetta
const TESTO_A = "Pulsazione. Battito. Due note alternate, distanza di quinta.\n".repeat(70);
const TESTO_B = "Non ero, poi fui due.\n".repeat(140);
const percorsoConDue = () => [{
  id: "p1", pillar: "vidya", title: "Divenire — concept album",
  topics: [{ id: "t1", label: "Atto I", status: "non iniziato" }],
  sessions: [], competenze: "", touchesPillars: [], localMemory: "",
  documents: [
    { id: "d1", name: "atto-i.md", title: "Atto I: Origine", text: TESTO_A, date: "2026-09-01T10:00:00.000Z", driveId: null },
    { id: "d2", name: "atto-ii.md", title: "Atto II: Differenziazione", text: TESTO_B, date: "2026-09-02T10:00:00.000Z", driveId: null },
  ],
}];

beforeEach(async () => {
  store.clear();
  globalThis.__accendiIdb();
  await app.caricaTestiDocumenti();
});
afterEach(() => { globalThis.__spegniIdb(); });

// ─────────────────────────────────────────────────────────────────────────────
describe("1 · IL BACKUP — il pezzo che non si può sbagliare", () => {
  test("il file di backup contiene i testi anche quando localStorage non li ha più", async () => {
    app.salvaPercorsi("percorsi-vidya", percorsoConDue());
    await attendi();
    // Premessa della prova: in localStorage i testi NON ci sono più davvero.
    assert.ok(!store.get("percorsi-vidya").includes("Pulsazione"), "il testo è ancora in localStorage: la prova non sta provando niente");

    const backup = app.buildFullBackup();
    assert.ok(backup.dati["percorsi-vidya"].includes("Pulsazione"), "IL BACKUP HA PERSO I TESTI");
    assert.ok(backup.dati["percorsi-vidya"].includes("Non ero, poi fui due"));
    assert.equal(JSON.parse(backup.dati["percorsi-vidya"])[0].documents[0].text, TESTO_A);
    // E anche lo specchio syncState, che è quello che si confronta a occhio col file su Drive.
    assert.equal(backup.syncState.pVidya[0].documents[1].text, TESTO_B);
  });

  test("giro completo: backup su un dispositivo, ripristino su uno vuoto, testi interi", async () => {
    app.salvaPercorsi("percorsi-vidya", percorsoConDue());
    await attendi();
    const backup = JSON.parse(JSON.stringify(app.buildFullBackup()));

    // Un altro telefono: niente in localStorage, niente nel magazzino.
    store.clear();
    globalThis.__idbDati.clear();
    await app.caricaTestiDocumenti();
    assert.deepEqual(app.leggiPercorsi("percorsi-vidya"), []);

    const esito = app.restoreFullBackup(backup);
    assert.equal(esito.ok, true, JSON.stringify(esito.fallite));
    // Il ripristino riscrive le chiavi com'erano — col testo dentro — e l'app si ricarica: è
    // l'avvio successivo a spostarlo nel magazzino. Qui si verifica che il testo sia arrivato.
    const dopo = app.leggiPercorsi("percorsi-vidya");
    assert.equal(dopo[0].documents[0].text, TESTO_A);
    assert.equal(dopo[0].documents[1].text, TESTO_B);
  });

  test("dopo il ripristino la migrazione sposta, e i testi restano leggibili", async () => {
    app.salvaPercorsi("percorsi-vidya", percorsoConDue());
    await attendi();
    const backup = JSON.parse(JSON.stringify(app.buildFullBackup()));
    store.clear(); globalThis.__idbDati.clear();
    await app.caricaTestiDocumenti();
    app.restoreFullBackup(backup);

    const esito = await app.migraTestiInIdb();
    assert.equal(esito.spostati, 2);
    assert.ok(!store.get("percorsi-vidya").includes("Pulsazione"), "la migrazione non ha alleggerito");
    assert.equal(app.leggiPercorsi("percorsi-vidya")[0].documents[0].text, TESTO_A);
  });

  test("il FORMATO del file di backup non cambia: uno di ieri si ripristina su oggi", () => {
    // Un backup fatto prima del 13/09 ha i testi dentro `percorsi-*`, che è esattamente quello che
    // buildFullBackup produce anche oggi. Nessuna chiave nuova, nessuna versione nuova.
    assert.equal(app.BACKUP_FORMAT_VERSION, 1);
    const vecchio = {
      _formato: "resonance-backup", _versione: 1,
      dati: { "percorsi-bio": JSON.stringify(percorsoConDue()) },
    };
    assert.equal(app.restoreFullBackup(vecchio).ok, true);
    assert.equal(app.leggiPercorsi("percorsi-bio")[0].documents[0].text, TESTO_A);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("2 · NIENTE SI TOGLIE SENZA UNA PROVA DI CONSEGNA", () => {
  test("il giro normale: salva, alleggerisce, e dopo un riavvio il testo è intero", async () => {
    const prima = JSON.stringify(percorsoConDue()).length;
    app.salvaPercorsi("percorsi-vidya", percorsoConDue());
    await attendi();
    const dopo = store.get("percorsi-vidya").length;
    assert.ok(dopo < prima / 10, `${dopo} byte su ${prima}: l'alleggerimento non è avvenuto`);
    assert.equal(globalThis.__idbDati.size, 2);

    await app.caricaTestiDocumenti(); // il riavvio
    const riletti = app.leggiPercorsi("percorsi-vidya");
    assert.equal(riletti[0].documents[0].text, TESTO_A);
    assert.equal(riletti[0].documents[1].text, TESTO_B);
    assert.equal(riletti[0].title, "Divenire — concept album", "il resto del percorso non deve cambiare");
    assert.equal(riletti[0].topics.length, 1);
  });

  test("SE IL MAGAZZINO RIFIUTA LA SCRITTURA, il testo resta in localStorage", async () => {
    globalThis.__idbGuasto = "scrittura";
    app.salvaPercorsi("percorsi-vidya", percorsoConDue());
    await attendi();
    globalThis.__idbGuasto = null;
    assert.ok(store.get("percorsi-vidya").includes("Pulsazione"), "ha alleggerito senza che il magazzino avesse scritto");
    assert.equal(globalThis.__idbDati.size, 0);
    // E il testo si rilegge lo stesso: è dove è sempre stato.
    assert.equal(app.leggiPercorsi("percorsi-vidya")[0].documents[0].text, TESTO_A);
  });

  test("SE LA RILETTURA NON COMBACIA, non si alleggerisce", async () => {
    // Non basta che la scrittura non lanci: si rilegge e si confronta il TESTO, non la lunghezza.
    const scritto = await app.scriviTestiDocumenti([["d1", TESTO_A]]);
    assert.equal(scritto, true);
    assert.equal(await app.testiDavveroNelMagazzino([["d1", TESTO_A]]), true);
    globalThis.__idbDati.set("d1", TESTO_A.slice(0, -5) + "ZZZZZ"); // stessa lunghezza, testo diverso
    assert.equal(await app.testiDavveroNelMagazzino([["d1", TESTO_A]]), false);
  });

  test("la migrazione non toglie niente se il magazzino non conferma", async () => {
    store.set("percorsi-air", JSON.stringify(percorsoConDue())); // com'era prima di oggi: testo dentro
    globalThis.__idbGuasto = "scrittura";
    const esito = await app.migraTestiInIdb();
    globalThis.__idbGuasto = null;
    assert.equal(esito.spostati, 0);
    assert.ok(store.get("percorsi-air").includes("Pulsazione"));
  });

  test("la migrazione è idempotente: al secondo giro non trova più niente", async () => {
    store.set("percorsi-air", JSON.stringify(percorsoConDue()));
    assert.equal((await app.migraTestiInIdb()).spostati, 2);
    assert.equal((await app.migraTestiInIdb()).spostati, 0);
    assert.equal(app.leggiPercorsi("percorsi-air")[0].documents[0].text, TESTO_A);
  });

  test("un testo sparito dal magazzino si dichiara, non diventa un documento vuoto", async () => {
    app.salvaPercorsi("percorsi-vidya", percorsoConDue());
    await attendi();
    globalThis.__idbDati.delete("d1"); // qualcuno ha svuotato i dati del sito
    await app.caricaTestiDocumenti();
    const d = app.leggiPercorsi("percorsi-vidya")[0].documents[0];
    assert.equal(d.text, undefined);
    assert.equal(d.testoIntrovabile, true, "un documento senza testo deve dirlo, non fingere di essere vuoto");
    assert.equal(d.title, "Atto I: Origine", "il nome resta: si sa cosa manca");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("3 · SENZA MAGAZZINO, TUTTO COME PRIMA", () => {
  test("senza IndexedDB il testo resta in localStorage e niente si rompe", async () => {
    globalThis.__spegniIdb();
    await app.caricaTestiDocumenti();
    app.salvaPercorsi("percorsi-bio", percorsoConDue());
    await attendi();
    assert.ok(store.get("percorsi-bio").includes("Pulsazione"), "senza magazzino il testo deve restare dov'era");
    assert.equal(app.leggiPercorsi("percorsi-bio")[0].documents[0].text, TESTO_A);
    assert.ok(app.buildFullBackup().dati["percorsi-bio"].includes("Pulsazione"));
    globalThis.__accendiIdb();
  });

  test("se il magazzino non si apre, l'avvio non lancia e si continua", async () => {
    globalThis.__idbGuasto = "apertura";
    await assert.doesNotReject(() => app.caricaTestiDocumenti());
    globalThis.__idbGuasto = null;
    app.salvaPercorsi("percorsi-bio", percorsoConDue());
    assert.equal(app.leggiPercorsi("percorsi-bio")[0].documents[0].text, TESTO_A);
  });

  test("se il magazzino è illeggibile si resta al comportamento di prima", async () => {
    globalThis.__idbGuasto = "lettura";
    await app.caricaTestiDocumenti();
    globalThis.__idbGuasto = null;
    app.salvaPercorsi("percorsi-bio", percorsoConDue());
    assert.ok(store.get("percorsi-bio").includes("Pulsazione"));
  });

  test("percorsiSnelli e percorsiPieni non toccano niente quando il magazzino è spento", async () => {
    globalThis.__spegniIdb();
    await app.caricaTestiDocumenti();
    const p = percorsoConDue();
    assert.equal(app.percorsiSnelli(p), p, "senza magazzino deve restituire lo stesso oggetto");
    globalThis.__accendiIdb();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("4 · LA FORMA CHE VIAGGIA NON CAMBIA", () => {
  test("lo stato in memoria ha i documenti COMPLETI: gli otto punti che leggono d.text non si toccano", async () => {
    app.salvaPercorsi("percorsi-vidya", percorsoConDue());
    await attendi();
    await app.caricaTestiDocumenti();
    const p = app.leggiPercorsi("percorsi-vidya");
    // dossierPercorso è uno degli otto: legge d.text e non sa niente del magazzino.
    const dossier = app.dossierPercorso(p[0]);
    assert.ok(dossier.includes("Atto I"), dossier.slice(0, 200));
    assert.ok(!p[0].documents[0].testoNelMagazzino, "il segno del magazzino non deve arrivare fin qui");
  });

  test("IL FILE DI SYNC CONTINUA A PORTARE I TESTI — senza, l'altro telefono non li riceverebbe", () => {
    // È il motivo per cui i testi NON sono stati tolti dal bundle: toglierli farebbe risparmiare
    // rete, ma i documenti smetterebbero di arrivare sul secondo dispositivo. Quella è una capacità,
    // non un costo. Lo stato React resta completo, quindi il bundle nasce completo.
    const locale = { ...app.SYNC_DEFAULTS, pVidya: percorsoConDue(), lastModified: 2 };
    const fuso = app.mergeSyncState(locale, { ...app.SYNC_DEFAULTS, lastModified: 1 });
    assert.equal(fuso.pVidya[0].documents[0].text, TESTO_A);
    assert.ok(JSON.stringify(fuso).includes("Pulsazione"));
  });

  test("uno stato fuso che arriva da Drive finisce nel magazzino come tutto il resto", async () => {
    app.salvaPercorsi("percorsi-air", percorsoConDue()); // è ciò che fa applyMergedState
    await attendi();
    assert.equal(globalThis.__idbDati.size, 2);
    assert.ok(!store.get("percorsi-air").includes("Pulsazione"));
  });

  test("un documento vecchio senza testo (pre 31/08/2026) resta com'è", async () => {
    const senzaTesto = [{ id: "p9", documents: [{ id: "d9", name: "vecchio.md", title: "Vecchio", date: "2026-08-01T00:00:00.000Z" }] }];
    app.salvaPercorsi("percorsi-bio", senzaTesto);
    await attendi();
    const d = app.leggiPercorsi("percorsi-bio")[0].documents[0];
    assert.equal(d.text, undefined);
    assert.equal(d.testoNelMagazzino, undefined);
    assert.equal(d.testoIntrovabile, undefined, "non è introvabile: non ne ha mai avuto uno");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("5 · LA MISURA — se il tetto non si alza, questo lavoro non serviva", () => {
  test("il peso in localStorage crolla, e il conto dei documenti che ci stanno esplode", async () => {
    const molti = [{ id: "p1", title: "tanti", documents: Array.from({ length: 50 }, (_, i) => ({ id: "d" + i, title: "Doc " + i, text: "z".repeat(4000), date: "2026-09-01T00:00:00.000Z" })) }];
    const prima = JSON.stringify(molti).length;
    app.salvaPercorsi("percorsi-vidya", molti);
    await attendi();
    const dopo = store.get("percorsi-vidya").length;
    assert.ok(dopo < prima / 20, `${dopo} su ${prima}`);
    // 50 documenti da 4.000 caratteri: 200.000 caratteri di testo, che in localStorage erano il 4%
    // della quota da 5 MB. Ora ne occupano quanto il loro solo indice.
    const perDocumento = dopo / 50;
    assert.ok(perDocumento < 200, `${perDocumento.toFixed(0)} byte per documento nell'indice`);
  });

  test("PIN sul sorgente: il magazzino si apre PRIMA che l'app si disegni", () => {
    // QUINTA occorrenza della stessa forma di buco (gate dei Semi 09/09, filtro sulle negazioni
    // 10/09, perLaVoce dentro speakText 11/09, il blocco capacità del turno 12/09). Qui è una
    // proprietà d'ORDINE fra due righe dello stesso file, e con i moduli ESM non è provabile dal
    // comportamento: si legge il testo del sorgente e si dichiara che è una lettura di testo.
    // Vale comunque, e il motivo è preciso: se qualcuno spostasse l'attesa DOPO `render`, al primo
    // disegno i documenti risulterebbero senza testo — e non si romperebbe niente a voce alta,
    // comparirebbe solo «questo documento non ha il testo salvato» su documenti che ce l'hanno.
    const src = readFileSync(new URL("../app.js", import.meta.url), "utf8");
    const iAttesa = src.indexOf("await caricaTestiDocumenti();");
    const iRender = src.indexOf("render(html`<${App} />`");
    const iMigra = src.indexOf("migraTestiInIdb().catch(");
    assert.ok(iAttesa > 0 && iRender > 0 && iMigra > 0, "una delle tre righe di avvio non c'è più");
    assert.ok(iAttesa < iRender, "il magazzino si apre DOPO il primo disegno: i documenti nascerebbero vuoti");
    assert.ok(iMigra > iRender, "la migrazione blocca il primo disegno: è lavoro che può aspettare");
  });

  test("tutti i testi si rileggono, uno per uno, dopo il riavvio", async () => {
    const molti = [{ id: "p1", documents: Array.from({ length: 50 }, (_, i) => ({ id: "d" + i, title: "Doc " + i, text: `contenuto numero ${i} ` + "z".repeat(500), date: "2026-09-01T00:00:00.000Z" })) }];
    app.salvaPercorsi("percorsi-vidya", molti);
    await attendi();
    await app.caricaTestiDocumenti();
    const riletti = app.leggiPercorsi("percorsi-vidya")[0].documents;
    assert.equal(riletti.length, 50);
    const persi = riletti.filter((d, i) => d.text !== `contenuto numero ${i} ` + "z".repeat(500)).map((d) => d.id);
    assert.deepEqual(persi, [], `testi persi: ${persi.join(", ")}`);
  });
});
