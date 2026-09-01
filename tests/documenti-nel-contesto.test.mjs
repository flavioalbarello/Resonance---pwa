// I documenti del percorso: quelli che lo Shell non leggeva e quelli che la ricerca non trovava
// (01/09/2026).
//
// Da dove viene. Il Ghost: "inoltre non mi sembra che legga i documenti del percorso e di
// conseguenza perde contesto". È esatto, ed erano DUE cose diverse, tutte e due per costruzione:
//
//   1. Con un percorso aperto, allo Shell arrivava l'INDICE dei documenti — titolo, data,
//      lunghezza, 180 caratteri d'inizio. Il testo intero arrivava solo se il modello sceglieva
//      l'azione apri_documento, cioè solo dopo il turno di selezione: la stessa strozzatura che si
//      è già mangiata "cancella" (25/08) e "genera" (31/08). Se la frase non somiglia a un comando,
//      lo Shell risponde su un ricordo.
//   2. cercaNellaMemoria — la funzione dietro interroga_memoria — guardava note correnti e
//      sedimento dei tre pilastri, e basta. Il materiale più lungo e più lavorato che il sistema
//      conserva, i documenti dei percorsi, era l'unica cosa che la ricerca non toccava mai.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();

const doc = (id, title, text, date = "2026-08-30") => ({ id, title, text, date });
const percorso = {
  id: "p1", title: "Divenire", topics: [{ label: "Atto I", status: "consolidato" }],
  documents: [
    doc("d1", "Atto I — l'apertura", "Testo integrale del primo atto, quello che è stato scritto per primo."),
    doc("d2", "Atto III — la rottura", "Testo integrale del terzo atto, dove la struttura si rompe."),
  ],
};

describe("documentoDaContesto — il documento che nessuno aveva chiesto di aprire", () => {
  test("IL CASO DEL GHOST: 'riprendiamo l'Atto III' apre il testo giusto, senza turno di selezione", () => {
    const aperto = app.documentoDaContesto(percorso, "riprendiamo l'Atto III dove eravamo rimasti");
    assert.ok(aperto, "il documento deve entrare nel turno");
    assert.equal(aperto.doc.id, "d2");
    assert.equal(aperto.automatico, true, "va dichiarato come apertura automatica, non come richiesta del Ghost");
    assert.match(aperto.doc.text, /la struttura si rompe/);
  });

  test("IL FRENO AL COSTO: una frase generica non trascina dentro dodicimila caratteri", () => {
    // Senza questo, ogni turno di ogni percorso con documenti allegherebbe un testo intero.
    for (const frase of ["cosa ne pensi?", "vai avanti", "ok", "e adesso?"]) {
      assert.equal(app.documentoDaContesto(percorso, frase), null, `"${frase}" non deve allegare niente`);
    }
  });

  test("UN SOLO DOCUMENTO NEL PERCORSO NON BASTA A FARLO ALLEGARE", () => {
    // trovaDocumentoNelPercorso risponde "trovato" anche quando ce n'è uno solo e nessuna parola
    // corrisponde — giusto quando il Ghost HA CHIESTO di riaprirlo, sbagliato qui: allegherebbe lo
    // stesso testo a ogni singolo turno. È la ragione per cui esiste viaPunteggio.
    const unoSolo = { ...percorso, documents: [doc("d1", "Atto I — l'apertura", "Testo del primo atto.")] };
    assert.equal(app.documentoDaContesto(unoSolo, "cosa ne pensi?"), null);
    assert.ok(app.documentoDaContesto(unoSolo, "rileggiamo l'apertura"), "con una corrispondenza vera sì");
  });

  test("due documenti che corrispondono allo stesso modo: non si sceglie, non si allega", () => {
    const ambiguo = { ...percorso, documents: [doc("a", "Note di lavoro", "prima"), doc("b", "Note di lavoro", "seconda")] };
    assert.equal(app.documentoDaContesto(ambiguo, "riprendiamo le note di lavoro"), null);
  });

  test("lo spareggio sui numeri vale anche qui: 'Atto I' non diventa 'Atto III'", () => {
    assert.equal(app.documentoDaContesto(percorso, "riprendiamo l'Atto I").doc.id, "d1");
  });

  test("senza percorso aperto, o senza frase, non si indovina niente", () => {
    assert.equal(app.documentoDaContesto(null, "riprendiamo l'Atto III"), null);
    assert.equal(app.documentoDaContesto(percorso, ""), null);
    assert.equal(app.documentoDaContesto(percorso, "   "), null);
  });

  test("un documento senza testo conservato non si allega: non c'è niente da leggere", () => {
    const senzaTesto = { ...percorso, documents: [{ id: "x", title: "Atto III — la rottura", text: "", date: "2026-08-01" }] };
    assert.equal(app.documentoDaContesto(senzaTesto, "riprendiamo l'Atto III"), null);
  });
});

describe("cercaNellaMemoria — adesso guarda anche dove c'era più roba", () => {
  const memoria = {
    bio: { corrente: "nota corrente BIO", sedimento: [] },
    air: { corrente: "nota corrente AIR", sedimento: [] },
    vidya: { corrente: "nota corrente VIDYA sul lavoro creativo", sedimento: [{ id: "f1", date: "2026-08-20", text: "frammento sedimentato sul divenire", chiavi: [] }] },
  };
  const percorsi = { bio: [], air: [], vidya: [{ ...percorso, competenze: "montaggio del suono", localMemory: "il terzo atto va tenuto corto" }] };

  test("IL DIFETTO: senza i percorsi, il testo degli atti non si trova — e non si trovava", () => {
    const senza = app.cercaNellaMemoria("rottura della struttura", memoria);
    assert.equal(senza.frammenti.length, 0, "è esattamente ciò che il Ghost vedeva: nessun risultato");
  });

  test("con i percorsi, lo stesso identico argomento trova il documento", () => {
    const con = app.cercaNellaMemoria("rottura della struttura", memoria, percorsi);
    assert.ok(con.frammenti.length > 0);
    assert.match(con.frammenti[0].text, /la struttura si rompe/);
  });

  test("OGNI RISULTATO DICE DA DOVE VIENE — un frammento senza provenienza non è un recupero", () => {
    const con = app.cercaNellaMemoria("rottura della struttura", memoria, percorsi);
    assert.match(con.frammenti[0].dove, /documento "Atto III — la rottura" nel percorso "Divenire"/);
  });

  test("il titolo del documento fa da chiave: 'Atto III' lo trova anche se nel corpo non c'è", () => {
    // Strato 1, già previsto da questa funzione per il sedimento: qui vale anche per i documenti.
    const con = app.cercaNellaMemoria("atto", memoria, percorsi);
    assert.ok(con.frammenti.some((f) => /Atto III/.test(f.dove || "")), "trovato per chiave, non per corpo");
  });

  test("competenze e memoria locale del percorso sono corpus anche loro", () => {
    const comp = app.cercaNellaMemoria("montaggio", memoria, percorsi);
    assert.match(comp.frammenti[0].dove, /competenze accumulate nel percorso "Divenire"/);
    const loc = app.cercaNellaMemoria("tenuto corto", memoria, percorsi);
    assert.match(loc.frammenti[0].dove, /memoria specifica del percorso "Divenire"/);
  });

  test("un documento lungo entra TAGLIATO: non copre tutti gli altri risultati", () => {
    const lungo = { bio: [], air: [], vidya: [{ id: "p2", title: "Lungo", documents: [doc("d9", "Fiume", "parola ".repeat(4000) + "ricerca")] }] };
    const r = app.cercaNellaMemoria("parola", memoria, lungo);
    assert.ok(r.frammenti[0].text.length <= app.TETTO_DOCUMENTO_IN_RICERCA + 1, `misurato ${r.frammenti[0].text.length}, tetto ${app.TETTO_DOCUMENTO_IN_RICERCA}`);
  });

  test("i frammenti di memoria continuano a funzionare esattamente come prima", () => {
    const r = app.cercaNellaMemoria("divenire", memoria, percorsi);
    assert.ok(r.frammenti.some((f) => f.text === "frammento sedimentato sul divenire"), "la regressione che conta");
  });

  test("dice dove ha guardato, e adesso include i documenti", () => {
    assert.match(app.cercaNellaMemoria("atto", memoria, percorsi).doveHoGuardato, /documenti dei percorsi/);
  });

  test("senza percorsi passati non esplode niente — la firma resta compatibile", () => {
    for (const p of [null, undefined, {}, { bio: [], air: [], vidya: [] }]) {
      assert.ok(Array.isArray(app.cercaNellaMemoria("nota", memoria, p).frammenti));
    }
  });
});
