// «NON ESISTONO» — IL CASO DEL 09/09/2026, E I QUATTRO DIFETTI CHE L'HANNO PRODOTTO.
//
// Dallo schermo del Ghost. Domanda: «Dimmi i temi dell'atto IV e dell'atto V». Risposta dello
// Shell: «Non esistono. Atto IV e V non sono nei documenti, né nelle note, né nelle bozze.»
// Detto due volte, con insistenza. Nel percorso VIDYA "Divenire — concept album" c'erano, salvati
// otto giorni prima: ATTO IV: Proiezione.md (4269 caratteri) e ATTO V: Trasformazione.md (4340).
//
// Il modello non aveva allucinato: aveva detto la verità su un contesto che il PROGRAMMA gli aveva
// costruito sbagliato. Quattro difetti in fila, ciascuno innocuo da solo.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();

// I dieci documenti veri del percorso, nell'ordine in cui un array cresce (il più vecchio per primo).
const DOCUMENTI_VERI = [
  ["Atto I — testi e note.md", "2026-09-01"],
  ["Atto I — testi e note.md", "2026-09-01"],
  ["Atto III Crisi Documento di sistema.docx", "2026-09-01"],
  ["ATTO I: Origine.md", "2026-09-01"],
  ["[non ancora — serve la tua conferma] nel percorso Divenire....md", "2026-09-01"],
  ["ATTO III: Crisi.md", "2026-09-01"],
  ["Atto II.md", "2026-09-02"],
  ["ATTO IV: Proiezione.md", "2026-09-02"],
  ["ATTO V: Trasformazione.md", "2026-09-02"],
  ["Divenire Concept Album Atto IV e Atto V.docx", "2026-09-10"],
].map(([title, date], i) => ({ id: "d" + i, title, date, text: `Brano ${i}: versi, pre-ritornello, ritornello.` }));

const percorsoVero = () => ({
  vidya: [{ id: "p1", title: "Divenire — concept album", documents: DOCUMENTI_VERI }],
  bio: [], air: [],
});
const memoriaVuota = () => ({
  vidya: { corrente: "", sedimento: [] }, bio: { corrente: "", sedimento: [] }, air: { corrente: "", sedimento: [] },
});
const cerca = (frase) => app.cercaNellaMemoria(frase, memoriaVuota(), percorsoVero());
const titoliTrovati = (r) => r.frammenti.map((f) => f.dove || "").join(" | ");

describe("IL CASO REALE — la domanda che ha prodotto «non esistono»", () => {
  test("LA FRASE ESATTA DEL GHOST RITROVA I DUE DOCUMENTI ESATTI", () => {
    const r = cerca("Dimmi i temi del atto IV e dell'atto V");
    const dove = titoliTrovati(r);
    assert.ok(dove.includes("ATTO IV: Proiezione.md"), `ATTO IV non consegnato. Consegnati: ${dove}`);
    assert.ok(dove.includes("ATTO V: Trasformazione.md"), `ATTO V non consegnato. Consegnati: ${dove}`);
  });

  test("e stanno IN CIMA, non in fondo per fortuna", () => {
    // Consegnare il documento giusto al quinto posto su cinque è vero ma fragile: basta un
    // documento in più nel percorso e torna il difetto.
    const r = cerca("Dimmi i temi del atto IV e dell'atto V");
    const primi = r.frammenti.slice(0, 3).map((f) => f.dove).join(" | ");
    assert.ok(primi.includes("ATTO IV") && primi.includes("ATTO V:"), `i primi tre sono: ${primi}`);
  });

  test("«atto IV» non trascina l'Atto I: la domanda distingue", () => {
    const r = cerca("i temi dell'atto IV");
    assert.ok(r.frammenti[0].dove.includes("ATTO IV") || r.frammenti[0].dove.includes("Atto IV"),
      `il primo risultato è: ${r.frammenti[0].dove}`);
  });
});

describe("DIFETTO 2 · i numeri corti erano scartati prima di cercare", () => {
  test("«IV» e «V» sono parole di ricerca, non rumore", () => {
    // paroleUtili non è esportata: si misura da fuori, sull'effetto. Senza i numeri, "atto IV" e
    // "atto V" darebbero lo stesso identico risultato — ed è ciò che succedeva.
    const iv = titoliTrovati(cerca("atto IV"));
    const v = titoliTrovati(cerca("atto V"));
    assert.notEqual(iv, v, "«atto IV» e «atto V» danno lo stesso risultato: i numeri non contano ancora");
  });

  test("anche le cifre arabe contano", () => {
    const docs = [
      { id: "a", title: "Capitolo 4.md", date: "2026-09-01", text: "testo" },
      { id: "b", title: "Capitolo 9.md", date: "2026-09-01", text: "testo" },
    ];
    const r = app.cercaNellaMemoria("capitolo 9", memoriaVuota(), { vidya: [{ id: "p", title: "P", documents: docs }], bio: [], air: [] });
    assert.ok(r.frammenti[0].dove.includes("Capitolo 9"), `primo: ${r.frammenti[0].dove}`);
  });

  test("«i» resta filtrato: è un articolo, non un numero romano", () => {
    // Se passasse, ogni frase italiana con "i" pescherebbe l'Atto I.
    const r = cerca("i temi");
    const primi = titoliTrovati(r);
    assert.ok(!primi.startsWith('documento "ATTO I: Origine.md"'),
      `«i» sta pescando l'Atto I: ${primi}`);
  });
});

describe("DIFETTO 3 · a pari punteggio vinceva l'ordine di inserimento", () => {
  test("LA SEQUENZA NEL TITOLO BATTE QUALUNQUE PAROLA SPARSA", () => {
    const r = cerca("atto IV");
    const conSequenza = r.frammenti.filter((f) => /ATTO IV|Atto IV/.test(f.dove));
    assert.ok(conSequenza.length >= 1);
    const altri = r.frammenti.filter((f) => !/ATTO IV|Atto IV/.test(f.dove));
    if (altri.length) {
      assert.ok(conSequenza[0].punti > altri[0].punti,
        `chi ha la sequenza nel titolo (${conSequenza[0].punti}) non batte chi non ce l'ha (${altri[0].punti})`);
    }
  });

  test("a parità di punti vince il più recente, non il primo inserito", () => {
    const docs = [
      { id: "vecchio", title: "Nota gemella.md", date: "2026-01-01", text: "sonno e recupero" },
      { id: "nuovo", title: "Nota gemella.md", date: "2026-09-01", text: "sonno e recupero" },
    ];
    const r = app.cercaNellaMemoria("sonno recupero", memoriaVuota(), { bio: [{ id: "p", title: "P", documents: docs }], air: [], vidya: [] });
    assert.equal(r.frammenti[0].id, "doc-p-nuovo", "ha vinto il più vecchio: l'ordine dell'array decide ancora");
  });

  test("il tetto dei frammenti è una costante dichiarata, non un numero dentro slice()", () => {
    assert.equal(typeof app.TETTO_FRAMMENTI_RICERCA, "number");
    assert.ok(app.TETTO_FRAMMENTI_RICERCA >= 3);
    assert.ok(cerca("atto").frammenti.length <= app.TETTO_FRAMMENTI_RICERCA);
  });
});

describe("DIFETTO 4 · dieci esaminati, cinque consegnati, nessuno lo diceva", () => {
  test("IL TAGLIO SI DICHIARA, con i numeri", () => {
    const r = cerca("atto");
    assert.equal(r.totaleEsaminati, 10);
    assert.equal(r.consegnati, r.frammenti.length);
    assert.ok(r.esclusi > 0, "con dieci documenti pertinenti e un tetto di cinque, gli esclusi non possono essere zero");
    assert.match(r.doveHoGuardato, /NON li hai visti/);
    assert.match(r.doveHoGuardato, /non prova che non esistano/);
  });

  test("quando non si taglia niente, non si spaventa nessuno", () => {
    const r = app.cercaNellaMemoria("sonno", memoriaVuota(), {
      bio: [{ id: "p", title: "P", documents: [{ id: "d", title: "Sonno.md", date: "2026-09-01", text: "il sonno" }] }], air: [], vidya: [],
    });
    assert.equal(r.esclusi, 0);
    assert.ok(!/NON li hai visti/.test(r.doveHoGuardato));
  });
});

describe("DIFETTO 1 · il filtro che mancava: le negazioni", () => {
  const titoli = ["ATTO IV: Proiezione.md", "ATTO V: Trasformazione.md", "Atto II.md", "ATTO I: Origine.md"];

  test("LA FRASE ESATTA CHE HA LETTO IL GHOST VIENE SMENTITA", () => {
    const detto = "Non esistono. La struttura che abbiamo costruito è 3 atti × 5 movimenti = 15 brani. Atto IV e V non sono nei documenti, né nelle note, né nelle bozze.";
    const r = app.smentisciAssenzaDiMateriale(detto, titoli);
    assert.ok(r.negazioni.length > 0, "la frase è passata indisturbata");
    assert.match(r.testo, /Il programma controlla e corregge/);
    assert.match(r.testo, /ATTO IV: Proiezione\.md/);
  });

  test("non cancella la risposta: aggiunge la smentita accanto", () => {
    // Cancellare lascerebbe una risposta monca su una domanda legittima, e il Ghost non saprebbe
    // perché. La frase del modello resta leggibile, con accanto il fatto.
    const detto = "Non ci sono documenti su questo.";
    const r = app.smentisciAssenzaDiMateriale(detto, titoli);
    assert.ok(r.testo.startsWith(detto), "la frase originale è stata alterata");
  });

  test("SENZA DATO IN MANO IL FILTRO TACE — non inventa una smentita per riempire il vuoto", () => {
    // È il caso del percorso non aperto: nessun titolo, nessuna smentita. Un filtro che smentisce
    // senza dato sarebbe peggio della frase che corregge.
    for (const t of [[], null, undefined, [""], ["ab"]]) {
      const r = app.smentisciAssenzaDiMateriale("Non esistono documenti.", t);
      assert.equal(r.negazioni.length, 0, JSON.stringify(t));
      assert.equal(r.testo, "Non esistono documenti.");
    }
  });

  describe("I FALSI POSITIVI — la parte che conta di più", () => {
    test("una negazione che NON parla di materiale non si tocca", () => {
      for (const f of [
        "Non ci sono controindicazioni a quell'esercizio.",
        "Non esistono prove che il digiuno intermittente funzioni per tutti.",
        "Non c'è un modo giusto di affrontarlo.",
        "Non ci sono impegni domani.",
      ]) {
        const r = app.smentisciAssenzaDiMateriale(f, titoli);
        assert.equal(r.testo, f, `smentita a sproposito: ${f}`);
      }
    });

    test("una risposta che NON nega niente non si tocca", () => {
      for (const f of [
        "L'Atto IV sviluppa il tema della popolazione e dell'ecosistema.",
        "Ecco i temi: interfaccia, proiezione, divisione consapevole.",
        "Nei documenti ci sono cinque brani per atto.",
      ]) {
        assert.equal(app.smentisciAssenzaDiMateriale(f, titoli).testo, f, f);
      }
    });

    test("il rilevatore isola la FRASE, non prende tutta la risposta", () => {
      const misto = "L'Atto I parla di mitosi. Non esistono documenti sull'Atto IX. Il resto c'è.";
      const n = app.rilevaNegazioneDiMateriale(misto);
      assert.equal(n.length, 1);
      assert.match(n[0], /Atto IX/);
    });

    test("testo vuoto o assente: niente", () => {
      for (const t of ["", null, undefined]) {
        assert.deepEqual(app.rilevaNegazioneDiMateriale(t), []);
      }
    });
  });

  test("nomina al massimo tre titoli: serve a far ricontrollare, non a rifare l'elenco", () => {
    const molti = Array.from({ length: 10 }, (_, i) => `Documento numero ${i}.md`);
    const r = app.smentisciAssenzaDiMateriale("Non esistono documenti.", molti);
    assert.equal(r.titoli.length, 3);
    assert.match(r.testo, /e altri 7/);
  });
});
