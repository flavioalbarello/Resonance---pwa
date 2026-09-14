// I NUMERI DETTI A PAROLE — 14/09/2026.
//
// Questo file non nasce da un'idea: nasce da tre righe di registro che il Ghost ha raccolto in
// macchina, col banco microfono. Ha detto tre volte la stessa frase e il telefono ha capito:
//
//   1 · in mano                  «Apri il percorso del Concept album e leggi il LATTO quarto»
//   2 · in tasca                 «Apri il percorso del Concept album e leggi il TUO quarto»
//   3 · in tasca, finestrino     «Apri il percorso del Concept album e leggi L'ATTO quarto»
//
// DUE FATTI, e vanno tenuti insieme perché da soli portano fuori strada:
//  · l'unica parola instabile è «l'atto» — tre trascrizioni diverse per la stessa parola, e la
//    giusta è arrivata dalla condizione PEGGIORE. Il rumore non è la variabile: lo è l'elisione.
//  · tutto il resto è arrivato intero tutte e tre le volte, «quarto» compreso.
// Quindi il programma aveva sempre in mano abbastanza per trovare il documento, e in due casi su
// tre rispondeva «non esiste», perché «quarto» per lui non era un numero.
//
// LE PROVE DI QUESTO FILE SONO QUELLE TRE FRASI, alla lettera. Non versioni pulite: quelle.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();

const ATTI = {
  id: "p1", title: "Divenire — concept album", topics: [{ id: "t1", label: "Atto IV" }],
  documents: [
    { id: "d4", name: "ATTO IV Proiezione.md", title: "ATTO IV Proiezione", text: "La proiezione. " + "x".repeat(4200), date: "2026-09-01T10:00:00.000Z" },
    { id: "d5", name: "ATTO V Trasformazione.md", title: "ATTO V Trasformazione", text: "La trasformazione. " + "y".repeat(4300), date: "2026-09-02T10:00:00.000Z" },
    { id: "d1", name: "ATTO I Origine.md", title: "ATTO I Origine", text: "L'origine. " + "z".repeat(3900), date: "2026-08-20T10:00:00.000Z" },
  ],
};
// Trascritte dal registro del banco, parola per parola.
const TRASCRIZIONI = [
  ["1 · in mano", "Apri il percorso del Concept album e leggi il latto quarto"],
  ["2 · in tasca", "Apri il percorso del Concept album e leggi il tuo quarto"],
  ["3 · in tasca, finestrino aperto", "Apri il percorso del Concept album e leggi l'atto quarto"],
];

describe("LE TRE FRASI VERE DEL BANCO — tutte devono trovare l'Atto IV", () => {
  for (const [condizione, frase] of TRASCRIZIONI) {
    test(`«${condizione}» → ${frase.slice(-22)}`, () => {
      const r = app.trovaDocumentoNelPercorso(ATTI, frase);
      assert.equal(r.esito, "trovato", `${r.esito}: ${(r.candidati || []).map((c) => c.title).join(" / ")}`);
      assert.equal(r.doc.title, "ATTO IV Proiezione");
    });
  }

  test("e la ricerca nella memoria mette l'Atto IV per PRIMO, non il più recente", () => {
    // Prima di oggi «atto quarto» restituiva l'Atto V in testa, perché la coppia contigua
    // «atto quarto» non sta in nessun titolo e a pari punteggio vince il documento più recente.
    const memoria = { bio: { corrente: "", sedimento: [] }, air: { corrente: "", sedimento: [] }, vidya: { corrente: "", sedimento: [] } };
    const r = app.cercaNellaMemoria("atto quarto", memoria, { bio: [], air: [], vidya: [ATTI] });
    assert.match(r.frammenti[0].dove, /ATTO IV/, r.frammenti.map((f) => f.dove).join(" | "));
  });
});

describe("4, IV e «quarto» sono lo stesso numero, ovunque", () => {
  test("i tre modi di dirlo portano allo stesso documento", () => {
    for (const frase of ["leggimi l'atto quarto", "leggimi l'atto IV", "leggimi l'atto 4"]) {
      const r = app.trovaDocumentoNelPercorso(ATTI, frase);
      assert.equal(r.esito, "trovato", frase);
      assert.equal(r.doc.title, "ATTO IV Proiezione", frase);
    }
  });

  test("«atto 4» contro un titolo «ATTO IV»: era ambiguo anche SCRIVENDOLO", () => {
    // Questo non c'entra con la voce: è un difetto che il Ghost aveva già oggi, trovato guardando
    // il primo. Il programma vedeva «4» e «iv» come due token diversi.
    assert.deepEqual(app.numeriDelTitolo("ATTO IV Proiezione"), app.numeriDelTitolo("Atto 4 Proiezione"));
    assert.deepEqual(app.numeriDelTitolo("atto quarto"), [4]);
  });

  test("gli ordinali coprono da primo a ventesimo, maschile e femminile", () => {
    assert.equal(app.numeroDaParola("primo"), 1);
    assert.equal(app.numeroDaParola("prima"), 1);
    assert.equal(app.numeroDaParola("ventesima"), 20);
    assert.equal(app.numeroDaParola("quindicesimo"), 15);
    assert.equal(app.numeroDaParola("ventunesimo"), null, "oltre il ventesimo non si finge di sapere");
  });

  test("i romani e le cifre restano quelli di prima", () => {
    assert.equal(app.numeroDaParola("xiv"), 14);
    assert.equal(app.numeroDaParola("7"), 7);
    assert.equal(app.numeroDaParola("2026"), null, "una data non è il numero di un atto");
    assert.equal(app.numeroDaParola("proiezione"), null);
  });

  test("le forme equivalenti si generano dalle stesse due tabelle, lette al contrario", () => {
    // Se un giorno si aggiunge un ordinale e si dimentica il romano, questa prova non se ne accorge
    // — ma se si aggiunge una tabella e non l'altra, le forme restano coerenti per costruzione.
    const f = app.formeDelToken("quarto");
    for (const atteso of ["4", "iv", "quarto", "quarta"]) assert.ok(f.includes(atteso), `manca ${atteso} in ${f.join(",")}`);
    assert.deepEqual(app.formeDelToken("proiezione"), ["proiezione"]);
  });
});

describe("IL RISCHIO CHE IL NUMERO-CHE-VALE-UN-PUNTO HA APERTO, e che è chiuso", () => {
  test("«i» da sola non è un numero in una domanda: è l'articolo", () => {
    // Da oggi un numero pesa sul punteggio. Senza questa distinzione, «leggi I documenti» avrebbe
    // regalato un punto al documento numero 1 in ogni domanda al plurale.
    assert.deepEqual(app.numeriChiestiForti("leggi i documenti del percorso"), []);
    assert.deepEqual(app.numeriChiestiForti("leggi l'atto quarto"), [4]);
    // Ma in un TITOLO «Atto I» resta un numero, altrimenti si perderebbe lo spareggio del 09/09.
    assert.deepEqual(app.numeriDelTitolo("ATTO I Origine"), [1]);
  });

  test("una domanda al plurale non fa vincere il documento numero uno", () => {
    for (const frase of ["leggi i documenti del percorso", "fammi vedere i testi che abbiamo salvato"]) {
      const r = app.trovaDocumentoNelPercorso(ATTI, frase);
      assert.notEqual(r.esito, "trovato", `${frase} → ${r.doc?.title}`);
    }
  });

  test("L'APERTURA AUTOMATICA non allega niente su una frase che contiene un numero per caso", () => {
    // Misurato appena aggiunto il punto sul numero, prima che ci fosse `viaSoloNumero`:
    // «domani è il 4 settembre» allegava 4.269 caratteri dell'Atto IV al turno. Nessuno aveva
    // chiesto niente: è il programma che decide da solo di mettere un documento davanti al modello.
    for (const frase of ["il quarto giorno sono stato male", "domani è il 4 settembre", "alle 4 ho un appuntamento", "ho dormito quattro ore"]) {
      assert.equal(app.documentoDaContesto(ATTI, frase), null, `«${frase}» ha allegato un documento`);
    }
  });

  test("ma quando la frase NOMINA il documento, l'apertura automatica funziona ancora", () => {
    // Il confine: qui una parola vera del titolo c'è. Se questa prova diventasse verde insieme a
    // quella sopra, vorrebbe dire che l'apertura automatica è stata spenta invece che corretta.
    for (const [frase, atteso] of [["riprendiamo l'Atto IV di ieri", "ATTO IV Proiezione"], ["quel pezzo sull'atto quinto", "ATTO V Trasformazione"]]) {
      const r = app.documentoDaContesto(ATTI, frase);
      assert.ok(r, `«${frase}» non ha allegato niente`);
      assert.equal(r.doc.title, atteso);
    }
  });

  test("il motivo per cui un documento è stato trovato viene dichiarato", () => {
    // `viaSoloNumero` è ciò che distingue le due prove qui sopra. Se sparisse, l'unica cosa che
    // succederebbe è che l'apertura automatica tornerebbe ad allegare documenti a caso.
    const soloNumero = app.trovaDocumentoNelPercorso(ATTI, "leggi il latto quarto");
    assert.equal(soloNumero.viaSoloNumero, true);
    const conParole = app.trovaDocumentoNelPercorso(ATTI, "leggi l'atto quarto");
    assert.equal(conParole.viaSoloNumero, false);
  });
});

describe("QUELLO CHE NON E' CAMBIATO", () => {
  test("lo spareggio del 09/09 sul numero romano regge ancora", () => {
    const r = app.trovaDocumentoNelPercorso(ATTI, "rileggimi l'Atto I");
    assert.equal(r.esito, "trovato");
    assert.equal(r.doc.title, "ATTO I Origine");
  });

  test("un percorso con un solo documento resta il caso facile", () => {
    const uno = { id: "p2", documents: [{ id: "u1", title: "Note", text: "qualcosa", date: "2026-09-01T00:00:00.000Z" }] };
    assert.equal(app.trovaDocumentoNelPercorso(uno, "rileggimelo").esito, "trovato");
  });

  test("una frase che non c'entra niente non trova niente", () => {
    const r = app.trovaDocumentoNelPercorso(ATTI, "parliamo della spesa al supermercato");
    assert.equal(r.esito, "nessuno");
    assert.equal(r.candidati.length, 3, "e dice cosa c'è invece di tacere");
  });
});
