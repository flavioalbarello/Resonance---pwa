// L'app di Marta era ferma, non degradata (02/09/2026).
//
// Dal registro del suo telefono, stanotte, tre volte di fila la stessa cosa — selezione-azione,
// shell-turn e simbiosi-proactive tutte fallite con
//     "Reasoning is mandatory for this endpoint and cannot be disabled."
// su model "google/gemini-3.1-pro-preview". Ha riscritto lo stesso messaggio tre volte in otto
// minuti senza ottenere niente.
//
// La causa è una riga giusta applicata male. Il 29/08 il registro aveva DIMOSTRATO che su Kimi
// `reasoning.max_tokens` non limita niente (2500 token di output, 2500 di ragionamento, contenuto
// vuoto) e che `enabled:false` invece porta il ragionamento a zero. Quindi è finito in tutte e due
// le costruzioni del corpo — INCONDIZIONATO. Vale per il modello di Flavio e rompe del tutto quello
// di Marta, e i due branch condividono il codice.
//
// Il rimedio non è un elenco di modelli mantenuto a mano, che sarebbe vecchio al primo modello
// nuovo: è un elenco che si riempie da solo con quello che il fornitore ha detto davvero.
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();

describe("riconoscere il rifiuto — il messaggio vero, e le varianti vicine", () => {
  test("IL MESSAGGIO ESATTO DAL REGISTRO DI MARTA", () => {
    assert.equal(app.eRifiutoDelRagionamentoSpento("Reasoning is mandatory for this endpoint and cannot be disabled."), true);
  });
  test("le varianti plausibili: un fornitore può riformulare, e il costo di sbagliare qui è un campo in meno", () => {
    for (const m of [
      "reasoning is mandatory for this model",
      "Reasoning cannot be disabled for this endpoint",
      "Reasoning tokens cannot be turned off",
      "Cannot disable reasoning on this provider",
    ]) assert.equal(app.eRifiutoDelRagionamentoSpento(m), true, m);
  });
  test("gli ALTRI errori non devono attivare il ripiego: sarebbe un secondo giro pagato per niente", () => {
    for (const m of [
      "Insufficient credits", "Rate limit exceeded", "model not found",
      "Provider returned error", "context length exceeded", "", null, undefined,
      "This model supports reasoning", // parla di reasoning ma non è un rifiuto
    ]) assert.equal(app.eRifiutoDelRagionamentoSpento(m), false, String(m));
  });
});

describe("l'elenco che si riempie da solo", () => {
  beforeEach(() => globalThis.__store.clear());

  test("IL MODELLO DI MARTA È GIÀ DENTRO — così il primo turno dopo l'aggiornamento non spreca un giro", () => {
    // Seminato con l'unico caso osservato dal vivo, non con una lista indovinata.
    assert.equal(app.ragionamentoObbligatorioPer("google/gemini-3.1-pro-preview"), true);
    assert.ok(app.MODELLI_RAGIONAMENTO_OBBLIGATORIO_NOTI.includes("google/gemini-3.1-pro-preview"));
  });
  test("il modello di produzione di Flavio NON è dentro: continua a risparmiare il ragionamento", () => {
    // È il punto: la riga del 29/08 resta valida dove era stata misurata valida.
    assert.equal(app.ragionamentoObbligatorioPer("moonshotai/kimi-k2.6"), false);
    assert.equal(app.ragionamentoObbligatorioPer("meta-llama/llama-3.3-70b-instruct"), false);
  });
  test("un modello nuovo che rifiuta viene imparato, e resta imparato", () => {
    assert.equal(app.ragionamentoObbligatorioPer("qualche/modello-futuro"), false);
    app.segnaRagionamentoObbligatorio("qualche/modello-futuro");
    assert.equal(app.ragionamentoObbligatorioPer("qualche/modello-futuro"), true, "sopravvive alla scrittura");
    assert.ok(app.modelliConRagionamentoObbligatorio().includes("qualche/modello-futuro"));
  });
  test("segnarlo due volte non lo duplica, e i noti non spariscono mai", () => {
    app.segnaRagionamentoObbligatorio("x/y");
    app.segnaRagionamentoObbligatorio("x/y");
    const l = app.modelliConRagionamentoObbligatorio();
    assert.equal(l.filter((m) => m === "x/y").length, 1);
    for (const noto of app.MODELLI_RAGIONAMENTO_OBBLIGATORIO_NOTI) assert.ok(l.includes(noto), `${noto} deve restare`);
  });
  test("un valore vuoto o corrotto in memoria non fa saltare la lettura", () => {
    app.segnaRagionamentoObbligatorio("");
    app.segnaRagionamentoObbligatorio(null);
    assert.deepEqual(app.modelliConRagionamentoObbligatorio(), app.MODELLI_RAGIONAMENTO_OBBLIGATORIO_NOTI);
    globalThis.__store.set("modelli-ragionamento-obbligatorio", '"non-un-array"');
    assert.deepEqual(app.modelliConRagionamentoObbligatorio(), app.MODELLI_RAGIONAMENTO_OBBLIGATORIO_NOTI);
  });
});
