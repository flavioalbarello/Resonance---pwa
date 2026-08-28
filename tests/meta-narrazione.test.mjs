// Il difetto del 28/08/2026: il modello che racconta come sta scrivendo, dentro la risposta stessa.
// Le frasi positive qui sotto NON sono inventate — sono copiate alla lettera dalle schermate del
// Ghost (piano alimentare bisettimanale, 5 pasti), dove insieme alle divagazioni non richieste
// hanno consumato tanto del tetto di 3000 token da far interrompere il piano a metà della seconda
// settimana.
//
// Cosa prova questo file, e cosa NON puo' provare. Prova che il rilevatore riconosce le forme
// realmente osservate e che non scatta su un piano alimentare scritto bene — cioe' che la MISURA e'
// affidabile. Non puo' provare che la regola aggiunta al prompt di sistema riduca davvero la
// meta-narrazione: quello lo dira' solo il registro di debug su un modello vero, ed e' esattamente
// il motivo per cui il rilevatore esiste invece di limitarsi alla regola.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();

describe("trovaMetaNarrazione — le forme osservate dal vivo il 28/08", () => {
  const osservate = [
    "Piccola pausa nella risposta per reset cognitivo tuo e mio.",
    "Torna a tabella strutturata ora.",
    "Torna alla tabella semplificata ora prosegue.",
    "Ricomincio con spuntino ora.",
    "Fine nota tecnica.",
    "Risposta prosegue con tabella standardizzata dal punto spuntino in poi.",
    "Pranzo martedì settimana due da tabella segue ora.",
    "Altrimenti prosegue come da tabella.",
    "Merenda martedì settimana due da tabella segue immediatamente senza ulteriori divagazioni testuali overhead cognitive non strettamente necessarie.",
  ];
  for (const frase of osservate) {
    test(`«${frase.slice(0, 55)}…» viene riconosciuta`, () => {
      assert.ok(app.trovaMetaNarrazione(frase).length > 0, "questa forma è stata osservata dal vivo: se smette di scattare, la misura non vale più");
    });
  }
});

describe("trovaMetaNarrazione — un piano scritto bene non deve far scattare niente", () => {
  // Il rischio vero di questo rilevatore non è mancare una forma (se ne aggiunge una), è dire
  // "meta-narrazione" davanti a un piano pulito: un contatore che si accende sempre non misura più
  // niente. Queste righe usano di proposito le stesse PAROLE dei trigger ("tabella", "risposta",
  // "segue", "pausa") in un uso legittimo.
  const legittime = [
    "| Lun | Uova strapazzate (2) + 1 fetta pane segale + pomodoro | 200g yogurt greco 0% |",
    "Petto di pollo (150g) + zucchine gratinate (250g) + 1 wasa.",
    "Ti ho messo la tabella qui sopra: se una porzione ti sembra troppo, dimmelo e la ricalibro.",
    "Fai una pausa di due minuti tra una serie e l'altra.",
    "La risposta alla tua domanda sulle proteine è che 1,6 g per kg bastano.",
    "Segue la stessa logica della settimana scorsa, con più pesce bianco.",
    "",
  ];
  for (const frase of legittime) {
    test(`«${frase.slice(0, 55) || "(testo vuoto)"}…» NON fa scattare il rilevatore`, () => {
      assert.deepEqual(app.trovaMetaNarrazione(frase), [], "falso positivo: un piano pulito non deve mai essere contato come meta-narrazione");
    });
  }
});

describe("trovaMetaNarrazione — forma del risultato", () => {
  test("restituisce i frammenti trovati, deduplicati e in minuscolo", () => {
    const r = app.trovaMetaNarrazione("Torna a tabella ora. Poi dopo un po' Torna a tabella di nuovo.");
    assert.equal(r.length, 1, "lo stesso frammento ripetuto va contato una volta sola");
    assert.equal(r[0], "torna a tabella");
  });
  test("un testo con più forme diverse le riporta tutte", () => {
    const r = app.trovaMetaNarrazione("Fine nota tecnica. Ricomincio con spuntino ora. Reset cognitivo.");
    assert.equal(r.length, 3);
  });
  test("il regex globale non si porta dietro lastIndex fra due chiamate (bug classico dei /g riusati)", () => {
    const frase = "Torna a tabella ora.";
    assert.equal(app.trovaMetaNarrazione(frase).length, 1);
    assert.equal(app.trovaMetaNarrazione(frase).length, 1, "seconda chiamata identica: se dà 0, lastIndex non è stato azzerato");
  });
});
