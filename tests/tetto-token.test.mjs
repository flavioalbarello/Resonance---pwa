// Il tetto di spazio di una risposta, reso variabile il 28/08/2026 su un dato misurato e non su
// un'impressione: nel registro di debug del Ghost, il piano alimentare bisettimanale ha chiuso con
// tokensOut 3000 su un tetto di 3000, due volte su due, con tokensRagionamento a 0. Non era spreco
// residuo — il compito non ci stava.
//
// Cosa protegge questo file: che la richiesta REALE che ha prodotto il difetto continui a ottenere
// il tetto alto (è la riga più importante, copiata alla lettera dal log), e che la conversazione
// normale resti sul tetto basso — perché un tetto alto ovunque inviterebbe il modello a dilungarsi
// proprio dove il prompt gli chiede 110 parole.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();

describe("tettoTokenPerIlTurno — i due tetti sono distinti e ordinati", () => {
  test("il tetto per contenuti lunghi è più alto di quello conversazionale", () => {
    assert.ok(app.TETTO_TOKEN_CONTENUTO_LUNGO > app.TETTO_TOKEN_CONVERSAZIONE);
  });
  test("il tetto conversazionale resta quello storico (3000): questa modifica non doveva toccarlo", () => {
    assert.equal(app.TETTO_TOKEN_CONVERSAZIONE, 3000);
  });
});

describe("tettoTokenPerIlTurno — le richieste di contenuto lungo prendono il tetto alto", () => {
  const lunghe = [
    // Copiata alla lettera dal registro di debug del 28/08 — è LA richiesta che si è tagliata.
    "Crea un piano alimentare bisettimanale, 5 pasti al giorno ( colazione, spuntino, pranzo, merenda, cena), appagante nei sapori e nelle quantità, non monotono, sulle 1600 kcal di media",
    "Fammi un programma di allenamento settimanale",
    "Preparami un menu per 7 giorni",
    "Scrivimi un documento che riassuma il percorso",
    "Dammi una scaletta per il video",
    "Mi serve un elenco completo delle cose da comprare",
    "Organizzami la settimana in una tabella",
    "Un piano mensile per la lettura",
  ];
  for (const frase of lunghe) {
    test(`«${frase.slice(0, 50)}…» → tetto alto`, () => {
      assert.equal(app.tettoTokenPerIlTurno(frase), app.TETTO_TOKEN_CONTENUTO_LUNGO);
    });
  }
});

describe("tettoTokenPerIlTurno — la conversazione normale resta sul tetto basso", () => {
  const normali = [
    "Quando è l'appuntamento con Marzio?",
    "Ho dormito male stanotte, mi sento a pezzi.",
    "Cosa ne pensi di quello che ho scritto ieri?",
    "Ciao, come va?",
    "Cancella l'appuntamento con Luigino",
    "Ok grazie",
    "",
  ];
  for (const frase of normali) {
    test(`«${frase || "(vuoto)"}» → tetto conversazionale`, () => {
      assert.equal(app.tettoTokenPerIlTurno(frase), app.TETTO_TOKEN_CONVERSAZIONE);
    });
  }
});

describe("tettoTokenPerIlTurno — ingressi non-stringa non fanno esplodere niente", () => {
  for (const v of [null, undefined, 42, {}, []]) {
    test(`${JSON.stringify(v) ?? String(v)} → tetto conversazionale, senza eccezioni`, () => {
      assert.equal(app.tettoTokenPerIlTurno(v), app.TETTO_TOKEN_CONVERSAZIONE);
    });
  }
});
