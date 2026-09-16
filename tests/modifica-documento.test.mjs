// modifica_documento — aggiungere o sostituire del testo in un documento senza riscriverlo tutto
// (16/09/2026, sera).
//
// Da dove viene, con lo schermo del Ghost davanti dopo il merge di oggi. Voleva solo aggiungere un
// paio di parole al testo di "ATTO I: Origine". L'unica risposta che lo Shell sapeva dare era:
//     "Posso solo: Sovrascrivere con nuova versione (cancello, riscrivo, tu confermi) /
//      Creare documento nuovo con testo modificato / Salvare qui sotto come nota a parte"
// Nessuna delle tre è "aggiungi tre parole". La cura non fa riscrivere l'intero documento a un
// modello economico (Llama 3.3 70B) per un'aggiunta minima — lo stesso rischio di alterazioni
// silenziose già documentato per il piano alimentare — ma fa individuare al modello SOLO due cose:
// dove (un'ancora copiata parola per parola dal testo) e cosa (il testo nuovo). Il programma fa il
// taglia-e-cuci vero, verificabile riga per riga.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();

describe("parametriModificaDocumento — un solo campo di registro, spezzato sui pipe", () => {
  test("i quattro campi nell'ordine giusto", () => {
    const p = app.parametriModificaDocumento("ATTO I: Origine | Pulsazione. Battito. | prima | Accade.");
    assert.deepEqual(p, { documento: "ATTO I: Origine", ancora: "Pulsazione. Battito.", posizione: "prima", testo: "Accade." });
  });
  test("l'ancora resta vuota per inizio/fine, senza rompere il conteggio dei campi", () => {
    assert.deepEqual(app.parametriModificaDocumento("Origine | | inizio | Titolo nuovo"),
      { documento: "Origine", ancora: "", posizione: "inizio", testo: "Titolo nuovo" });
  });
  test("un pipe dentro il testo nuovo non lo spezza: l'ultimo campo assorbe il resto", () => {
    const p = app.parametriModificaDocumento("Origine | Battito | dopo | tempo|spazio");
    assert.equal(p.testo, "tempo|spazio");
  });
  test("la posizione è sempre in minuscolo, qualunque maiuscola arrivi dal modello", () => {
    assert.equal(app.parametriModificaDocumento("Origine | X | PRIMA | y").posizione, "prima");
  });
  test("una stringa vuota non esplode niente", () => {
    assert.deepEqual(app.parametriModificaDocumento(""), { documento: "", ancora: "", posizione: "", testo: "" });
    assert.deepEqual(app.parametriModificaDocumento(null), { documento: "", ancora: "", posizione: "", testo: "" });
  });
});

describe("applicaModificaDocumento — il taglia-e-cuci vero, mai una riscrittura", () => {
  const doc = () => ({ id: "d1", title: "ATTO I: Origine", text: "Pulsazione. Battito. Due note alternate, distanza di quinta." });

  test("IL CASO REALE: aggiungere una parola all'inizio di una frase già presente, con lo spazio giusto", () => {
    const r = app.applicaModificaDocumento(doc(), { posizione: "prima", ancora: "Pulsazione.", testo: "Accade." });
    assert.equal(r.ok, true);
    assert.equal(r.nuovo, "Accade. Pulsazione. Battito. Due note alternate, distanza di quinta.");
  });

  test("dopo un'ancora, con lo spazio giusto anche lì", () => {
    const r = app.applicaModificaDocumento(doc(), { posizione: "dopo", ancora: "Battito.", testo: "Silenzio." });
    assert.equal(r.ok, true);
    assert.equal(r.nuovo, "Pulsazione. Battito. Silenzio. Due note alternate, distanza di quinta.");
  });

  test("sostituire un frammento: lo spazio intorno resta quello originale, non se ne aggiunge altro", () => {
    const r = app.applicaModificaDocumento(doc(), { posizione: "sostituisci", ancora: "Battito.", testo: "Respiro." });
    assert.equal(r.ok, true);
    assert.equal(r.nuovo, "Pulsazione. Respiro. Due note alternate, distanza di quinta.");
  });

  test("inizio e fine dell'intero documento non hanno bisogno di un'ancora", () => {
    const inizio = app.applicaModificaDocumento(doc(), { posizione: "inizio", testo: "Titolo." });
    assert.equal(inizio.ok, true);
    assert.match(inizio.nuovo, /^Titolo\.\n\nPulsazione/);
    const fine = app.applicaModificaDocumento(doc(), { posizione: "fine", testo: "Fine atto." });
    assert.equal(fine.ok, true);
    assert.match(fine.nuovo, /quinta\.\n\nFine atto\.$/);
  });

  test("IL FRENO: un'ancora che non si trova non modifica niente, e lo dice", () => {
    const r = app.applicaModificaDocumento(doc(), { posizione: "dopo", ancora: "frase mai scritta", testo: "x" });
    assert.equal(r.ok, false);
    assert.match(r.motivo, /non trovo/);
    assert.match(r.motivo, /frase mai scritta/);
  });

  test("IL FRENO GEMELLO: un'ancora ambigua (più di un'occorrenza) non si sceglie a caso", () => {
    const ripetuto = { id: "d2", title: "X", text: "La nota. Ancora la nota. Poi la nota di nuovo." };
    const r = app.applicaModificaDocumento(ripetuto, { posizione: "dopo", ancora: "la nota", testo: "y" });
    assert.equal(r.ok, false);
    assert.match(r.motivo, /compare \d+ volte/);
  });

  test("un'ancora con maiuscole diverse da come compare davvero si trova lo stesso, se resta unica", () => {
    const r = app.applicaModificaDocumento(doc(), { posizione: "prima", ancora: "pulsazione.", testo: "Accade." });
    assert.equal(r.ok, true);
    assert.match(r.nuovo, /^Accade\. Pulsazione\./);
  });

  test("senza testo da inserire non si fa niente", () => {
    assert.equal(app.applicaModificaDocumento(doc(), { posizione: "inizio", testo: "" }).ok, false);
    assert.equal(app.applicaModificaDocumento(doc(), { posizione: "inizio", testo: "   " }).ok, false);
  });

  test("posizione diversa da fine/prima/dopo/sostituisci/inizio non forza mai una modifica", () => {
    assert.equal(app.applicaModificaDocumento(doc(), { posizione: "boh", ancora: "Battito.", testo: "x" }).ok, false);
  });

  test("prima/dopo/sostituisci senza ancora dichiarano il motivo invece di indovinare inizio/fine", () => {
    const r = app.applicaModificaDocumento(doc(), { posizione: "prima", ancora: "", testo: "x" });
    assert.equal(r.ok, false);
    assert.match(r.motivo, /serve un frammento/);
  });

  test("un documento senza testo conservato non si può modificare", () => {
    assert.equal(app.applicaModificaDocumento({ id: "d3", title: "Vecchio" }, { posizione: "inizio", testo: "x" }).ok, false);
    assert.equal(app.applicaModificaDocumento(null, { posizione: "inizio", testo: "x" }).ok, false);
  });

  test("l'anteprima mostra davvero cosa cambia, non un riassunto", () => {
    const r = app.applicaModificaDocumento(doc(), { posizione: "sostituisci", ancora: "Battito.", testo: "Respiro." });
    assert.equal(r.anteprima.rimosso, "Battito.");
    assert.equal(r.anteprima.inserito, "Respiro.");
    assert.match(r.anteprima.prima, /Pulsazione\.\s*$/);
    assert.match(r.anteprima.dopo, /^\s*Due note/);
  });
});

describe("applicaModificaManuale — il gemello senza ancora, quando il Ghost scrive lui stesso (16/09/2026, notte)", () => {
  const doc = () => ({ id: "d1", title: "ATTO I: Origine", text: "Pulsazione. Battito.", date: "2026-09-16T08:00:00Z" });

  test("un testo diverso sostituisce quello vecchio, che scende in versioniPrecedenti — Legge 14", () => {
    const r = app.applicaModificaManuale(doc(), "Pulsazione. Battito. Accade.");
    assert.equal(r.ok, true);
    assert.equal(r.doc.text, "Pulsazione. Battito. Accade.");
    assert.equal(r.doc.versioniPrecedenti.length, 1);
    assert.equal(r.doc.versioniPrecedenti[0].text, "Pulsazione. Battito.");
    assert.equal(r.doc.versioniPrecedenti[0].date, "2026-09-16T08:00:00Z");
  });

  test("le versioni si accumulano nell'ordine giusto, la più recente per prima", () => {
    const dopoUnGiro = app.applicaModificaManuale(doc(), "Prima modifica.").doc;
    const dopoDueGiri = app.applicaModificaManuale(dopoUnGiro, "Seconda modifica.");
    assert.equal(dopoDueGiri.doc.versioniPrecedenti.length, 2);
    assert.equal(dopoDueGiri.doc.versioniPrecedenti[0].text, "Prima modifica.");
    assert.equal(dopoDueGiri.doc.versioniPrecedenti[1].text, "Pulsazione. Battito.");
  });

  test("IL FRENO: salvare senza aver cambiato niente non accumula una versione identica", () => {
    const r = app.applicaModificaManuale(doc(), "Pulsazione. Battito.");
    assert.equal(r.ok, false);
    assert.match(r.motivo, /non è cambiato/);
  });

  test("senza un documento non c'è niente da modificare", () => {
    assert.equal(app.applicaModificaManuale(null, "qualcosa").ok, false);
    assert.equal(app.applicaModificaManuale(undefined, "qualcosa").ok, false);
  });

  test("cancellare tutto il testo è una modifica valida quanto le altre — non è compito di questa funzione impedirlo", () => {
    const r = app.applicaModificaManuale(doc(), "");
    assert.equal(r.ok, true);
    assert.equal(r.doc.text, "");
  });
});
