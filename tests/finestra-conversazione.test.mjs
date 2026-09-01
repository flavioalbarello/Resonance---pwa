// Quale conversazione, esattamente (01/09/2026).
//
// Il Ghost: "ho chiesto allo Shell di creare un documento e mi ha proposto il piano alimentare".
// Stava parlando di un concept album da due ore.
//
// La causa non è il modello: è che il pulsante dice "da questa conversazione" e il programma non
// sapeva cosa fosse "questa conversazione". Prendeva gli ultimi trenta messaggi, qualunque cosa
// contenessero — e trenta messaggi indietro, nella sua chat, c'era il piano alimentare negoziato
// tre giorni prima. Davanti a una finestra che contiene una discussione musicale e un piano
// alimentare completo di vincoli, "il documento concordato" è il piano: è la cosa più finita, più
// negoziata, più a forma di documento che ci sia dentro. Il modello ha scelto bene la cosa
// sbagliata, perché la domanda era mal posta.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();

const ORA = new Date("2026-09-01T02:40:00Z").getTime();
const ORE = 3600000;
const msg = (id, role, oreFa, content) => ({ id, role, content, time: new Date(ORA - oreFa * ORE).toISOString() });

describe("finestraConversazione — il taglio è il tempo", () => {
  // La chat vera del Ghost: il piano alimentare di tre giorni prima, poi l'album di stanotte.
  const chat = [
    msg("v1", "user", 74, "fammi un piano alimentare bisettimanale"),
    msg("v2", "assistant", 74, "Pesce escluso, colazioni salate, pasta di legumi…"),
    msg("v3", "user", 73, "va bene così"),
    msg("n1", "user", 2, "vorrei un canovaccio per un concept album sull'evoluzione"),
    msg("n2", "assistant", 2, "ATTO I: Origine — Mitosi, Prima divisione, Colonia"),
    msg("n3", "user", 1, "procedi con l'Atto II"),
  ];

  test("IL CASO REALE: il piano alimentare di tre giorni fa resta fuori", () => {
    const f = app.finestraConversazione(chat, 30);
    assert.equal(f.messaggi.length, 3);
    assert.deepEqual(f.messaggi.map((m) => m.id), ["n1", "n2", "n3"]);
    assert.equal(f.tagliataPerStacco, true);
    const testo = f.messaggi.map((m) => m.content).join(" ");
    assert.doesNotMatch(testo, /piano alimentare|colazioni salate/i);
  });
  test("una conversazione continua non viene tagliata", () => {
    const continua = [msg("a", "user", 3, "uno"), msg("b", "assistant", 2, "due"), msg("c", "user", 1, "tre")];
    const f = app.finestraConversazione(continua, 30);
    assert.equal(f.messaggi.length, 3);
    assert.equal(f.tagliataPerStacco, false);
  });
  test("la soglia è la stessa del fuoco conversazionale, non un numero nuovo", () => {
    // "Un contesto ereditato da ieri e non chiuso non è più il contesto": stessa ragione, stessa soglia.
    assert.equal(app.ORE_DI_STACCO_CONVERSAZIONE, 8);
  });
  test("uno stacco appena sotto la soglia NON taglia, appena sopra sì", () => {
    const sotto = [msg("a", "user", 8.9, "prima"), msg("b", "user", 1, "dopo")];
    assert.equal(app.finestraConversazione(sotto, 30).tagliataPerStacco, false, "7,9 ore: è una pausa");
    const sopra = [msg("a", "user", 10, "prima"), msg("b", "user", 1, "dopo")];
    assert.equal(app.finestraConversazione(sopra, 30).tagliataPerStacco, true, "9 ore: è un'altra conversazione");
  });
  test("si taglia allo stacco PIÙ RECENTE, non al primo trovato dall'inizio", () => {
    const tre = [msg("a", "user", 100, "vecchissima"), msg("b", "user", 50, "vecchia"), msg("c", "user", 1, "adesso")];
    assert.deepEqual(app.finestraConversazione(tre, 30).messaggi.map((m) => m.id), ["c"]);
  });

  test("il tetto resta un tetto: una sessione lunghissima non entra tutta", () => {
    const lunga = Array.from({ length: 60 }, (_, i) => msg("m" + i, i % 2 ? "assistant" : "user", 5 - i * 0.05, "riga " + i));
    assert.equal(app.finestraConversazione(lunga, 30).messaggi.length, 30);
  });
  test("i messaggi di sistema non entrano nel documento", () => {
    const conNote = [...chat, { id: "sn", role: "system-note", content: "— messaggi compattati —", time: new Date(ORA).toISOString() }];
    assert.ok(!app.finestraConversazione(conNote, 30).messaggi.some((m) => m.role === "system-note"));
  });
  test("MESSAGGI SENZA ORARIO NON TAGLIANO: meglio una finestra larga che una vuota", () => {
    // I messaggi vecchi possono non avere `time`. Trattarli come uno stacco taglierebbe tutto.
    const senzaOra = [{ id: "a", role: "user", content: "prima" }, { id: "b", role: "assistant", content: "dopo" }];
    const f = app.finestraConversazione(senzaOra, 30);
    assert.equal(f.messaggi.length, 2);
    assert.equal(f.tagliataPerStacco, false);
  });
  test("dice da quando parte, così il Ghost lo vede prima di generare", () => {
    const f = app.finestraConversazione(chat, 30);
    assert.match(f.primoOrario, /\d{2}:\d{2}/);
  });
  test("una chat vuota non fa esplodere niente", () => {
    for (const v of [[], null, undefined]) {
      const f = app.finestraConversazione(v, 30);
      assert.deepEqual(f.messaggi, []);
      assert.equal(f.tagliataPerStacco, false);
    }
  });
});
