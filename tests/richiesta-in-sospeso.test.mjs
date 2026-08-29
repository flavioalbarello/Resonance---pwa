// La richiesta che sopravvive all'uscita dall'app (29/08/2026).
//
// Il Ghost: "su Claude o Gemini lancio la domanda, vado a fare altro, e quando riapro trovo la
// risposta. Qui invece decade la chiamata". La causa è strutturale (nessun server tiene in mano la
// richiesta: è il browser di quella scheda a parlare con OpenRouter, e Android lo sospende), e la
// soluzione piena è un relay lato server — il passo successivo già concordato. Questo copre il
// pezzo che si può avere senza infrastruttura: la richiesta non si perde e riparte da sola.
//
// Le due regole che qui diventano verificabili sono quelle che, se sbagliate, costerebbero soldi
// veri al Ghost: si riprende SOLO dopo un guasto di rete, e SOLO entro una finestra di tempo.
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();

beforeEach(() => app.chiudiRichiestaInSospeso());

describe("il ciclo di vita della richiesta messa da parte", () => {
  test("salvata e riletta uguale", () => {
    app.salvaRichiestaInSospeso("Crea un piano alimentare bisettimanale");
    assert.equal(app.leggiRichiestaInSospeso().testo, "Crea un piano alimentare bisettimanale");
  });
  test("chiusa, non si rilegge più — è ciò che impedisce due giri sullo stesso testo", () => {
    app.salvaRichiestaInSospeso("qualcosa");
    app.chiudiRichiestaInSospeso();
    assert.equal(app.leggiRichiestaInSospeso(), null);
  });
  test("quando non c'è niente, non c'è niente", () => {
    assert.equal(app.leggiRichiestaInSospeso(), null);
  });
});

describe("la finestra di quindici minuti", () => {
  test("dentro la finestra si riprende", () => {
    app.salvaRichiestaInSospeso("piano");
    const pocoDopo = Date.now() + app.FINESTRA_RIPRESA_MS - 1000;
    assert.ok(app.leggiRichiestaInSospeso(pocoDopo));
  });
  test("oltre la finestra si lascia perdere — riaprire l'app il giorno dopo non deve far ripartire (e pagare) una richiesta abbandonata", () => {
    app.salvaRichiestaInSospeso("piano");
    const ilGiornoDopo = Date.now() + 24 * 60 * 60 * 1000;
    assert.equal(app.leggiRichiestaInSospeso(ilGiornoDopo), null);
  });
});

describe("eGuastoDiRete — solo la rete merita una ripresa", () => {
  test("i guasti di rete veri, incluso quello osservato nei registri del Ghost", () => {
    for (const m of ["Failed to fetch", "NetworkError when attempting to fetch resource", "Load failed", "timeout"]) {
      assert.equal(app.eGuastoDiRete(m), true, `"${m}" è un guasto di rete`);
    }
  });
  test("un errore VERO non si riprende: ripartirebbe a ogni riapertura, pagando ogni giro", () => {
    for (const m of ["Nessuna chiave API impostata (vai in Setup).", "Errore OpenRouter: invalid model", "Risposta non valida"]) {
      assert.equal(app.eGuastoDiRete(m), false, `"${m}" NON deve far ripartire niente`);
    }
  });
  test("ingressi vuoti o strani non fanno esplodere niente", () => {
    for (const v of [null, undefined, "", 42, {}]) assert.equal(app.eGuastoDiRete(v), false);
  });
});
