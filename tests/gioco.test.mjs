// Il Gioco — 16/09/2026, in direzione Adam.
//
// Da dove viene. Il Ghost: «l'app dovrebbe, su richiesta, poter creare dei "giochi" da sottoporre
// all'utente col fine di progredire in un determinato percorso... sia testuali che audio che
// visivi... una sorta di platform per il ritmo o un quiz sonoro dove riconoscere un determinato
// intervallo o il modo di una scala».
//
// La scelta che chiude tutto il resto: un gioco non può essere il modello che narra "hai vinto".
// Family testuale — il modello propone il mazzo intero PRIMA di giocare, il programma verifica.
// Family audio — pura aritmetica (temperamento equabile), il programma genera E verifica, zero
// chiamate al modello. Queste prove coprono lib/gioco.js: la parte pura, mai il browser
// (AudioContext vive in app.js, come il microfono — non testabile in Node, per scelta dichiarata).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();

describe("calcolaEsitoGioco — l'esito è aritmetica, non un giudizio del modello", () => {
  test("sopra l'80% è consolidato", () => {
    const e = app.calcolaEsitoGioco([true, true, true, true, false]); // 4/5 = 80%
    assert.equal(e.livello, "consolidato");
    assert.equal(e.corrette, 4);
    assert.equal(e.totali, 5);
  });
  test("fra 50% e 80% è praticato", () => {
    const e = app.calcolaEsitoGioco([true, true, false, false]); // 50%
    assert.equal(e.livello, "praticato");
  });
  test("sotto il 50% è introdotto", () => {
    const e = app.calcolaEsitoGioco([true, false, false, false]); // 25%
    assert.equal(e.livello, "introdotto");
  });
  test("nessuna risposta non produce un livello finto", () => {
    const e = app.calcolaEsitoGioco([]);
    assert.equal(e.livello, null);
    assert.equal(e.totali, 0);
  });
});

describe("valutaRispostaGioco — un solo confronto per le due famiglie", () => {
  test("la risposta deve combaciare esattamente con l'atteso", () => {
    assert.equal(app.valutaRispostaGioco({ atteso: "quinta giusta" }, "quinta giusta"), true);
    assert.equal(app.valutaRispostaGioco({ atteso: "quinta giusta" }, "quinta diminuita"), false);
  });
  test("spazi bianchi ai bordi non ingannano il confronto", () => {
    assert.equal(app.valutaRispostaGioco({ atteso: "dorico" }, "  dorico  "), true);
  });
  test("nessuna risposta, nessun round: non esplode, non passa per buono", () => {
    assert.equal(app.valutaRispostaGioco(null, "qualcosa"), false);
    assert.equal(app.valutaRispostaGioco({ atteso: "x" }, undefined), false);
  });
});

describe("validaMazzoTestuale — un round storto si scarta, mai mostrato rotto", () => {
  test("un mazzo pulito passa intero", () => {
    const r = app.validaMazzoTestuale([
      { domanda: "Quale nota è la tonica di Do maggiore?", opzioni: ["Do", "Re", "Mi", "Fa"], corretta: "Do", spiegazione: "È la nota che dà il nome alla scala." },
      { domanda: "Quanti bemolli ha Fa maggiore?", opzioni: ["0", "1", "2", "3"], corretta: "1" },
    ]);
    assert.equal(r.ok, true);
    assert.equal(r.round.length, 2);
    assert.equal(r.scartati, 0);
    assert.equal(r.round[0].meccanica, "testuale");
  });
  test("IL FRENO: una risposta 'corretta' che non compare fra le opzioni si scarta", () => {
    const r = app.validaMazzoTestuale([
      { domanda: "X?", opzioni: ["a", "b", "c"], corretta: "d" },
      { domanda: "Y?", opzioni: ["a", "b"], corretta: "a" },
    ]);
    assert.equal(r.ok, true);
    assert.equal(r.round.length, 1);
    assert.equal(r.scartati, 1);
  });
  test("meno di due opzioni, domanda vuota, o risposta vuota: scartati allo stesso modo", () => {
    const r = app.validaMazzoTestuale([
      { domanda: "", opzioni: ["a", "b"], corretta: "a" },
      { domanda: "Z?", opzioni: ["solo-una"], corretta: "solo-una" },
      { domanda: "W?", opzioni: ["a", "b"], corretta: "" },
    ]);
    assert.equal(r.ok, false);
    assert.equal(r.scartati, 3);
  });
  test("un mazzo vuoto o non-elenco dichiara il motivo, non finge un gioco", () => {
    assert.equal(app.validaMazzoTestuale([]).ok, false);
    assert.equal(app.validaMazzoTestuale(null).ok, false);
    assert.equal(app.validaMazzoTestuale("non un elenco").ok, false);
  });
});

describe("frequenzaDiNota — temperamento equabile, verificabile a mano", () => {
  test("A4 è 440 Hz per definizione", () => {
    assert.equal(app.frequenzaDiNota("A4"), 440);
  });
  test("un'ottava sopra raddoppia la frequenza", () => {
    assert.equal(app.frequenzaDiNota("A5"), 880);
    assert.equal(app.frequenzaDiNota("A3"), 220);
  });
  test("C4 (do centrale) è ~261.63 Hz, il valore da manuale", () => {
    assert.ok(Math.abs(app.frequenzaDiNota("C4") - 261.6256) < 0.001);
  });
  test("una nota scritta male non restituisce un numero inventato", () => {
    assert.equal(app.frequenzaDiNota("H4"), null);
    assert.equal(app.frequenzaDiNota("do centrale"), null);
    assert.equal(app.frequenzaDiNota(""), null);
  });
});

describe("generaRoundIntervallo/generaRoundModo — deterministici con un rng iniettato", () => {
  // rng costante: ogni scelta prende sempre il primo elemento disponibile. Non serve un generatore
  // vero per queste prove — serve solo che il comportamento sia PREVEDIBILE, non "probabilmente giusto".
  const rngZero = () => 0;

  test("il round di intervallo suona due frequenze, tonica e tonica+intervallo", () => {
    const r = app.generaRoundIntervallo(rngZero);
    assert.equal(r.meccanica, "audio");
    assert.equal(r.sottotipo, "intervallo");
    assert.equal(r.frequenze.length, 2);
    assert.ok(app.INTERVALLI[r.atteso] !== undefined, `"${r.atteso}" deve essere un intervallo noto`);
    const semitoni = app.INTERVALLI[r.atteso];
    const rapportoAtteso = Math.pow(2, semitoni / 12);
    assert.ok(Math.abs(r.frequenze[1] / r.frequenze[0] - rapportoAtteso) < 1e-9);
  });
  test("l'atteso compare sempre fra le opzioni, e le opzioni non si ripetono", () => {
    const r = app.generaRoundIntervallo(Math.random);
    assert.ok(r.opzioni.includes(r.atteso));
    assert.equal(new Set(r.opzioni).size, r.opzioni.length);
  });
  test("il round di modo suona l'intera scala (8 note, tonica compresa due volte)", () => {
    const r = app.generaRoundModo(rngZero);
    assert.equal(r.sottotipo, "modo");
    assert.equal(r.frequenze.length, 8);
    assert.ok(app.MODI[r.atteso] !== undefined, `"${r.atteso}" deve essere un modo noto`);
    // Prima e ultima nota sono la stessa classe (ottava esatta): il rapporto è 2.
    assert.ok(Math.abs(r.frequenze[7] / r.frequenze[0] - 2) < 1e-9);
  });
  test("il modo dorico su D è tutte note bianche (D E F G A B C D) — verificabile a orecchio", () => {
    // Non un caso a caso: è l'esempio che chiunque suoni può controllare su una tastiera vera.
    const rNoteBianche = { dorico: app.MODI.dorico };
    const freqD = app.frequenzaDiNota("D4");
    const attese = ["D4", "E4", "F4", "G4", "A4", "B4", "C5", "D5"].map(app.frequenzaDiNota);
    const calcolate = app.MODI.dorico.map((semitoni) => freqD * Math.pow(2, semitoni / 12));
    calcolate.forEach((f, i) => assert.ok(Math.abs(f - attese[i]) < 0.01, `nota ${i}: ${f} vs ${attese[i]}`));
  });
});

describe("generaMazzoAudioSenzaModello — nessuna chiamata al modello, il mazzo esiste già", () => {
  test("produce il numero di round richiesto", () => {
    assert.equal(app.generaMazzoAudioSenzaModello("intervallo", 6).length, 6);
    assert.equal(app.generaMazzoAudioSenzaModello("modo", 3).length, 3);
  });
  test("il sottotipo richiesto è quello che arriva in ogni round", () => {
    for (const r of app.generaMazzoAudioSenzaModello("modo", 5)) assert.equal(r.sottotipo, "modo");
    for (const r of app.generaMazzoAudioSenzaModello("intervallo", 5)) assert.equal(r.sottotipo, "intervallo");
  });
  test("almeno un round anche se ne viene chiesto zero o un numero negativo", () => {
    assert.equal(app.generaMazzoAudioSenzaModello("intervallo", 0).length, 1);
    assert.equal(app.generaMazzoAudioSenzaModello("intervallo", -3).length, 1);
  });
});

describe("eGioco — riconosce un documento-gioco, non un documento qualunque", () => {
  test("un documento con tipo gioco è riconosciuto", () => {
    assert.equal(app.eGioco({ tipo: "gioco" }), true);
  });
  test("un documento normale, uno spartito, null: non sono giochi", () => {
    assert.equal(app.eGioco({ tipo: "spartito" }), false);
    assert.equal(app.eGioco({ text: "prosa" }), false);
    assert.equal(app.eGioco(null), false);
  });
});
