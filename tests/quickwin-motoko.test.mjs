// Regressione permanente per le due decisioni prese il 26/08/2026 in risposta all'audit "Motoko":
//   · validaPercorsoSuggerito — la proposta di un NUOVO percorso che Simbiosi può fare, oltre ai 4
//     mandati del Manifesto V3 §5. Deve scartare in silenzio una proposta mal formata o duplicata,
//     esattamente come già succede per identityHint (stesso principio, mai un bottone che non sa
//     cosa creare).
//   · eVincoloAlimentare — il caso "zucchine" sollevato dal Ghost: un vincolo alimentare (BIO, "niente
//     zucchine") non deve mai essere confuso con un vincolo di ambito diverso che nomina lo stesso
//     alimento per un motivo opposto (una composizione artistica VIDYA che usa la zucchina come
//     soggetto). L'ambito, non il pilastro, decide se un vincolo è alimentare.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();

describe("validaPercorsoSuggerito — proposta di nuovo percorso da Simbiosi", () => {
  test("null in ingresso resta null", () => {
    assert.equal(app.validaPercorsoSuggerito(null), null);
  });
  test("una proposta completa e valida passa, con pillar normalizzato", () => {
    const r = app.validaPercorsoSuggerito(
      { pillar: "VIDYA", title: "Disegno anatomico", motivazione: "continua il percorso di scrittura creativa con un'abilità visiva affine", collegatoA: ["Scrittura creativa"] },
      ["Scrittura creativa"]
    );
    assert.deepEqual(r, { pillar: "vidya", title: "Disegno anatomico", motivazione: "continua il percorso di scrittura creativa con un'abilità visiva affine", collegatoA: ["Scrittura creativa"] });
  });
  test("pillar non riconosciuto scarta la proposta", () => {
    assert.equal(app.validaPercorsoSuggerito({ pillar: "bof", title: "X", motivazione: "Y" }), null);
  });
  test("title mancante scarta la proposta", () => {
    assert.equal(app.validaPercorsoSuggerito({ pillar: "bio", title: "", motivazione: "Y" }), null);
  });
  test("motivazione mancante scarta la proposta", () => {
    assert.equal(app.validaPercorsoSuggerito({ pillar: "bio", title: "X", motivazione: "" }), null);
  });
  test("un titolo che duplica un percorso già esistente (anche per accenti/maiuscole) viene scartato — il punto è aprire qualcosa di NUOVO", () => {
    const r = app.validaPercorsoSuggerito(
      { pillar: "bio", title: "Perché correre", motivazione: "Y" },
      ["PERCHE CORRERE"]
    );
    assert.equal(r, null);
  });
  test("collegatoA non-array o con elementi non stringa viene ripulito a un array vuoto, non fa fallire la proposta", () => {
    const r = app.validaPercorsoSuggerito({ pillar: "air", title: "X", motivazione: "Y", collegatoA: "non un array" });
    assert.deepEqual(r.collegatoA, []);
  });
});

describe("eVincoloAlimentare — il caso zucchine: l'ambito decide, non il pilastro", () => {
  test("un vincolo con ambito 'alimentare' esplicito è alimentare, a prescindere dal pilastro", () => {
    assert.equal(app.eVincoloAlimentare({ ambito: "alimentare", pilastro: "vidya" }), true);
  });
  test("un vincolo BIO con un ambito diverso dichiarato NON è alimentare — es. un vincolo di allenamento", () => {
    assert.equal(app.eVincoloAlimentare({ ambito: "allenamento", pilastro: "bio" }), false);
  });
  test("un vincolo VIDYA senza ambito dichiarato non è (per fallback) alimentare — la zucchina nell'arte resta libera", () => {
    assert.equal(app.eVincoloAlimentare({ pilastro: "vidya" }), false);
  });
  test("un vincolo BIO storico, dichiarato prima che l'ambito esistesse (nessun campo ambito), resta trattato come alimentare — nessuna regressione sui vincoli già salvati", () => {
    assert.equal(app.eVincoloAlimentare({ pilastro: "bio" }), true);
  });
  test("un vincolo AIR senza ambito non è alimentare", () => {
    assert.equal(app.eVincoloAlimentare({ pilastro: "air" }), false);
  });
});
