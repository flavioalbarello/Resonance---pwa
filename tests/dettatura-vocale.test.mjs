// fondiFrammentoVocale — la dettatura che ripeteva parole, e cresceva insieme al ripetersi
// (16/09/2026, notte).
//
// Osservato dal vivo, con lo schermo del Ghost davanti: dicendo una volta sola "Apri atto 1
// origine", è finita in chat la frase "Apri Apri Apri Apri atto Apri atto Apri atto 1 Apri atto 1
// origine Apri atto 1 origine". Il riconoscimento vocale di Android, in modalità continua, a volte
// RI-FINALIZZA la stessa frase con un pezzo in più invece di finalizzarla una volta sola alla fine
// — e il codice sommava ogni ri-finalizzazione in coda a quello che c'era già, invece di
// riconoscerla come la STESSA frase, più lunga.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();

describe("fondiFrammentoVocale — la sovrapposizione si sostituisce, non si somma", () => {
  test("IL CASO REALE, ricostruito pezzo per pezzo: il risultato finale è la frase detta una volta sola", () => {
    let acc = "";
    for (const pezzo of ["Apri", "Apri", "Apri atto", "Apri atto", "Apri atto 1", "Apri atto 1 origine", "Apri atto 1 origine"]) {
      acc = app.fondiFrammentoVocale(acc, pezzo);
    }
    assert.equal(acc, "Apri atto 1 origine");
  });

  test("IL CASO PIÙ CORTO, osservato anche lui dal vivo: «Apri Apri divenire» diventa «Apri divenire»", () => {
    let acc = "";
    for (const pezzo of ["Apri", "Apri", "Apri divenire"]) acc = app.fondiFrammentoVocale(acc, pezzo);
    assert.equal(acc, "Apri divenire");
  });

  test("«voglio voglio modificarlo»: la ri-finalizzazione con un pezzo in più non raddoppia la prima parola", () => {
    let acc = "";
    for (const pezzo of ["voglio", "voglio modificarlo"]) acc = app.fondiFrammentoVocale(acc, pezzo);
    assert.equal(acc, "voglio modificarlo");
  });

  test("un pezzo del tutto nuovo, senza sovrapposizione, si accoda normalmente", () => {
    assert.equal(app.fondiFrammentoVocale("Apri atto uno", "e dammi il testo"), "Apri atto uno e dammi il testo");
  });

  test("un pezzo identico a quello che c'è già non duplica niente", () => {
    assert.equal(app.fondiFrammentoVocale("Apri atto uno", "Apri atto uno"), "Apri atto uno");
  });

  test("il confronto ignora le maiuscole: il riconoscimento non le scrive sempre uguali", () => {
    assert.equal(app.fondiFrammentoVocale("Apri", "apri atto"), "Apri atto");
  });

  test("accumulo vuoto: il primo pezzo diventa il risultato, senza spazi iniziali", () => {
    assert.equal(app.fondiFrammentoVocale("", "Apri"), "Apri");
    assert.equal(app.fondiFrammentoVocale(null, "Apri"), "Apri");
  });

  test("pezzo vuoto: l'accumulo resta quello che era", () => {
    assert.equal(app.fondiFrammentoVocale("Apri atto", ""), "Apri atto");
    assert.equal(app.fondiFrammentoVocale("Apri atto", null), "Apri atto");
  });

  test("IL FRENO: la sovrapposizione è per PAROLE intere, non per prefissi di caratteri", () => {
    // "atto" e "attorno" non devono fondersi come se "atto" fosse un prefisso valido di "attorno":
    // sono parole diverse, e unirle a metà produrrebbe un testo che nessuno ha detto.
    assert.equal(app.fondiFrammentoVocale("vai atto", "attorno a te"), "vai atto attorno a te");
  });
});
