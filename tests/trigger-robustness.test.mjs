// QUICK WIN #1 dell'audit "Motoko" (25/08/2026): trattare "un regex di trigger dimentica una
// forma" come una CLASSE di bug da testare sistematicamente, non un incidente da scoprire dal
// vivo ogni volta. Stasera è successo almeno quattro volte, su meccanismi diversi:
//   · VERBI_AZIONE mancava "fissa" e i verbi di cancellazione (scoperto dal vivo, due volte)
//   · TROVA_EVENTO_DIRETTO_RE non riconosceva "quand'è" (scoperto dal vivo)
//   · detectPercorsoProposalHeuristic non riconosceva "vuoi che ne apra uno" (scoperto dal vivo)
// Questa prova non previene il PROSSIMO caso specifico — nessuna lista di varianti è completa.
// Previene che una forma GIÀ osservata rompere qualcosa smetta di essere testata quando il codice
// cambia: se domani qualcuno stringe uno di questi regex, questa prova si accorge se una delle
// varianti già note torna a non funzionare.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./lib/build-testable.mjs";
import { variantiDiverse } from "./lib/variants.mjs";

const app = await loadApp();

describe("scorciatoia diretta calendario (TROVA_EVENTO_DIRETTO_RE) — robustezza alle varianti", () => {
  const basiCheDevonoScattare = [
    "Quando è l'appuntamento con Marzio?",
    "Cercami il prossimo appuntamento con Marialdo",
    "A che ora è il dentista?",
  ];
  for (const base of basiCheDevonoScattare) {
    test(`base: «${base}»`, () => {
      assert.equal(app.candidataTrovaEventoDiretta(base), true, "la frase base deve scattare — se questo fallisce il problema è a monte, non nelle varianti");
    });
    for (const [nomeVariante, variante] of variantiDiverse(base)) {
      test(`variante ${nomeVariante} di «${base}» → «${variante}»`, () => {
        assert.equal(
          app.candidataTrovaEventoDiretta(variante), true,
          `la variante "${nomeVariante}" ha rotto il riconoscimento — stessa classe di bug del 25/08 (elisione "quand'è")`
        );
      });
    }
  }
});

describe("proposta di percorso (detectPercorsoProposalHeuristic) — robustezza alle varianti", () => {
  const basiCheDevonoScattare = [
    "Vuoi che apra un percorso sulla scrittura creativa?",
  ];
  for (const base of basiCheDevonoScattare) {
    test(`base: «${base}»`, () => {
      assert.equal(app.detectPercorsoProposalHeuristic(base).proposed, true);
    });
    for (const [nomeVariante, variante] of variantiDiverse(base)) {
      test(`variante ${nomeVariante} di «${base}» → «${variante}»`, () => {
        assert.equal(
          app.detectPercorsoProposalHeuristic(variante).proposed, true,
          `la variante "${nomeVariante}" ha rotto il riconoscimento — stessa classe di bug del 25/08 ("vuoi che ne apra uno")`
        );
      });
    }
  }
});

describe("VERBI_AZIONE — verbi già dimenticati una volta, non devono tornare a mancare", () => {
  // Ognuno di questi è stato osservato MANCARE dal vivo in una data passata (vedi commenti su
  // VERBI_AZIONE in app.js). Restano qui perché un regex enorme è facile da restringere per
  // sbaglio senza accorgersene — questo test lo dice subito, non dopo un test reale del Ghost.
  const fraseDaRiconoscere = [
    ["FISSA per domani un promemoria", "storico: 'fissa' mancava (17/08)"],
    ["Cancella Marzio", "storico: verbi di cancellazione mancavano (25/08)"],
    ["Cancella Filocornio", "storico: verbi di cancellazione mancavano (25/08)"],
    ["Che ora è l'appuntamento", "storico: 'che ora' mancava"],
    ["e adesso?", "storico: continuazione percorso"],
  ];
  for (const [frase, motivo] of fraseDaRiconoscere) {
    test(`«${frase}» fa partire la selezione (${motivo})`, () => {
      assert.equal(app.meritaTurnoDiSelezione(frase), true);
    });
  }
});
