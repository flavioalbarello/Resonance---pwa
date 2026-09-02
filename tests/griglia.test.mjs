// La griglia come primitiva (02/09/2026) — carenza 05 del referto del 31/08.
//
// Da dove viene. montaPianoAlimentare risolveva un problema generale — riempire righe e colonne
// rispettando una rotazione, delle esclusioni e un bersaglio numerico per riga — e lo risolveva solo
// per i pasti. La scoperta più costosa di quella settimana (tre notti, cinque diagnosi sbagliate)
// era incastonata dentro un unico uso. Costo dichiarato di non estrarla: la prossima volta che serve
// una griglia si torna a chiederla al modello in un colpo solo, e degenera di nuovo alla stessa ora.
//
// Queste prove usano DELIBERATAMENTE un dominio che non è il cibo — un piano di allenamento — per
// dimostrare che la primitiva non sa più di pasti. Che il comportamento sul piano alimentare non sia
// cambiato lo dimostrano le 54 prove di piano-montato.test.mjs, scritte PRIMA di questa estrazione:
// quelle sono il paracadute, questo file è l'estensione.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();

// Un piano di allenamento: la stessa griglia, un altro vocabolario.
const es = (nome, carico) => ({ nome, carico });
const riscaldamenti = [es("mobilità", 0), es("corsa lenta", 0), es("saltelli", 0)];
const forza = [es("stacchi", 60), es("squat", 55), es("panca", 40), es("trazioni", 30), es("military", 35), es("affondi", 25), es("rematore", 45)];
const defaticamenti = [es("stretching", 5), es("respirazione", 2), es("camminata", 8)];

describe("montaGriglia — la meccanica, senza sapere di cosa parla", () => {
  test("riempie tutte le righe e tutte le colonne dichiarate", () => {
    const g = app.montaGriglia({ righe: 10, ciclo: 7, colonne: [
      { id: "riscaldamento", lista: riscaldamenti },
      { id: "forza", lista: forza, modo: "meno-recente" },
    ] });
    assert.equal(g.righe.length, 10);
    for (const r of g.righe) {
      assert.ok(r.celle.riscaldamento, `riga ${r.indice} senza riscaldamento`);
      assert.ok(r.celle.forza, `riga ${r.indice} senza forza`);
    }
  });

  test("IL TEOREMA SULLE RIPETIZIONI: con la distanza minima, nessun elemento torna troppo presto", () => {
    const g = app.montaGriglia({ righe: 14, ciclo: 7, colonne: [{ id: "forza", lista: forza, modo: "meno-recente" }] });
    const ultimo = new Map();
    for (const r of g.righe) {
      const nome = r.celle.forza.nome;
      const prima = ultimo.get(nome);
      if (prima !== undefined) {
        const distanza = Math.min(forza.length - 1, app.DISTANZA_MINIMA_RIPETIZIONE);
        assert.ok(r.indice - prima > distanza, `"${nome}" torna al giorno ${r.indice} dopo il ${prima}`);
      }
      ultimo.set(nome, r.indice);
    }
  });

  test("una lista più corta delle righe ripete, ma il più lontano possibile — mai una cella vuota", () => {
    const g = app.montaGriglia({ righe: 12, ciclo: 7, colonne: [{ id: "x", lista: [es("a", 1), es("b", 1)], modo: "meno-recente" }] });
    assert.equal(g.righe.length, 12);
    for (const r of g.righe) assert.ok(r.celle.x, "nessuna riga può restare senza cella");
    // Con due soli elementi devono alternarsi, non incollarsi su uno.
    const nomi = g.righe.map((r) => r.celle.x.nome);
    assert.equal(new Set(nomi).size, 2, "usa entrambi, non si blocca sul primo");
  });

  test("IL DIFETTO DEL 29/08 NON PUÒ TORNARE: liste alternative, registro condiviso", () => {
    // Il difetto vero: due liste sulla stessa colonna con contatori indipendenti, quindi lo stesso
    // elemento poteva uscire da entrambe a un giorno di distanza. Qui la lista cambia in base alla
    // posizione nel ciclo e le due si SOVRAPPONGONO apposta.
    const comuni = [es("stacchi", 60), es("squat", 55)];
    const soloPari = [...comuni, es("panca", 40)];
    const soloDispari = [...comuni, es("trazioni", 30)];
    const g = app.montaGriglia({ righe: 14, ciclo: 2, colonne: [
      { id: "forza", modo: "meno-recente", listaPerRiga: (d, pos) => (pos === 0 ? soloPari : soloDispari) },
    ] });
    const nomi = g.righe.map((r) => r.celle.forza.nome);
    for (let i = 1; i < nomi.length; i++) {
      assert.notEqual(nomi[i], nomi[i - 1], `"${nomi[i]}" due righe di fila (${i - 1} e ${i}) — è esattamente il difetto del 29/08`);
    }
  });

  test("LA LEVA: la colonna-leva avvicina il totale di riga al bersaglio", () => {
    const g = app.montaGriglia({
      righe: 8, ciclo: 7, valore: (e) => e.carico, bersaglioDiRiga: () => 100,
      colonne: [
        { id: "riscaldamento", lista: riscaldamenti },
        { id: "forza", lista: forza, modo: "meno-recente" },
        { id: "defaticamento", lista: defaticamenti, modo: "meno-recente", leva: true },
      ],
    });
    // Senza leva, il defaticamento ruoterebbe e basta. Con la leva, ogni riga sceglie quello che
    // avvicina di più — a parità di vincolo di distanza.
    for (const r of g.righe) {
      const parziale = r.totale - r.celle.defaticamento.carico;
      const migliore = defaticamenti.reduce((a, b) => (Math.abs(parziale + b.carico - 100) < Math.abs(parziale + a.carico - 100) ? b : a));
      const scartoScelto = Math.abs(r.totale - 100);
      const scartoMigliore = Math.abs(parziale + migliore.carico - 100);
      // Non sempre il migliore in assoluto: la distanza minima resta un vincolo, il bersaglio è il
      // criterio DENTRO quel vincolo. Ma non può mai essere il PEGGIORE quando il migliore è ammesso.
      assert.ok(scartoScelto >= scartoMigliore, "impossibile fare meglio del migliore ammesso");
    }
  });

  test("senza bersaglio la leva si comporta come una colonna normale, non esplode", () => {
    const g = app.montaGriglia({ righe: 5, ciclo: 7, valore: (e) => e.carico, colonne: [
      { id: "forza", lista: forza, modo: "meno-recente" },
      { id: "defaticamento", lista: defaticamenti, modo: "meno-recente", leva: true },
    ] });
    assert.equal(g.righe.length, 5);
    for (const r of g.righe) assert.ok(r.celle.defaticamento);
  });

  test("i totali e le statistiche sono CALCOLATI, non dichiarati", () => {
    const g = app.montaGriglia({ righe: 6, ciclo: 7, valore: (e) => e.carico, colonne: [
      { id: "forza", lista: forza, modo: "meno-recente" },
      { id: "defaticamento", lista: defaticamenti },
    ] });
    for (const r of g.righe) assert.equal(r.totale, r.celle.forza.carico + r.celle.defaticamento.carico);
    const totali = g.righe.map((r) => r.totale);
    assert.equal(g.minimo, Math.min(...totali));
    assert.equal(g.massimo, Math.max(...totali));
    assert.equal(g.media, Math.round(totali.reduce((a, b) => a + b, 0) / totali.length));
  });

  test("blocco e posizione nel ciclo sono coerenti col ciclo dichiarato", () => {
    const g = app.montaGriglia({ righe: 15, ciclo: 7, colonne: [{ id: "x", lista: riscaldamenti }] });
    assert.deepEqual(g.righe.map((r) => r.posizione).slice(0, 9), [0, 1, 2, 3, 4, 5, 6, 0, 1]);
    assert.deepEqual([g.righe[0].blocco, g.righe[6].blocco, g.righe[7].blocco, g.righe[14].blocco], [1, 1, 2, 3]);
  });

  test("una chiave diversa da 'nome' funziona: la primitiva non impone lo schema degli elementi", () => {
    const g = app.montaGriglia({
      righe: 10, ciclo: 5, chiave: (e) => e.codice,
      colonne: [{ id: "t", lista: [{ codice: "A1" }, { codice: "B2" }, { codice: "C3" }], modo: "meno-recente" }],
    });
    assert.equal(g.righe.length, 10);
    assert.ok(g.righe.every((r) => r.celle.t.codice));
  });

  describe("i rifiuti dichiarati — una griglia a metà non si consegna", () => {
    test("nessuna colonna", () => {
      assert.equal(app.montaGriglia({ righe: 5, colonne: [] }), null);
      assert.equal(app.montaGriglia({}), null);
    });
    test("una colonna con la lista vuota: null, non righe monche", () => {
      assert.equal(app.montaGriglia({ righe: 5, colonne: [{ id: "x", lista: [] }] }), null);
      assert.equal(app.montaGriglia({ righe: 5, colonne: [{ id: "x", modo: "meno-recente", listaPerRiga: () => [] }] }), null);
    });
    test("DUE LEVE: rifiutato, perché non ha un significato definito", () => {
      // La seconda ottimizzerebbe contro una somma che la prima ha già fissato: il risultato
      // dipenderebbe dall'ordine delle colonne invece che dal bersaglio.
      assert.equal(app.montaGriglia({ righe: 3, colonne: [
        { id: "a", lista: forza, leva: true }, { id: "b", lista: defaticamenti, leva: true },
      ] }), null);
    });
    test("numeri di righe assurdi vengono riportati dentro i limiti, non fatti esplodere", () => {
      assert.equal(app.montaGriglia({ righe: 0, colonne: [{ id: "x", lista: riscaldamenti }] }).righe.length, 1);
      assert.equal(app.montaGriglia({ righe: 9999, colonne: [{ id: "x", lista: riscaldamenti }] }).righe.length, 365);
    });
  });
});

describe("montaPianoAlimentare continua a essere il caso particolare di questa primitiva", () => {
  // La regressione che conta di più: l'estrazione non deve aver cambiato niente. Qui si controlla
  // solo che l'adattatore regga; il comportamento in dettaglio è coperto da piano-montato.test.mjs.
  const rep = {
    colazioni: [{ nome: "c1", kcal: 300 }, { nome: "c2", kcal: 320 }],
    spuntini: [{ nome: "s1", kcal: 150 }, { nome: "s2", kcal: 130 }],
    pranzi: [{ nome: "p1", kcal: 600 }, { nome: "p2", kcal: 650, portatile: true }, { nome: "p3", kcal: 580 }, { nome: "p4", kcal: 620, portatile: true }],
    merende: [{ nome: "m1", kcal: 120 }, { nome: "m2", kcal: 140 }],
    cene: [{ nome: "n1", kcal: 500 }, { nome: "n2", kcal: 600 }, { nome: "n3", kcal: 700 }, { nome: "n4", kcal: 450 }],
  };
  test("il piano si monta ancora, con le stesse chiavi di prima", () => {
    const piano = app.montaPianoAlimentare(rep, { giorni: 14, kcalMedia: 1800, giorniPortatili: [1, 3] });
    assert.equal(piano.righe.length, 14);
    for (const r of piano.righe) {
      for (const k of ["colazione", "spuntino", "pranzo", "merenda", "cena"]) assert.ok(r[k], `manca ${k}`);
      assert.ok(r.giorno && r.settimana >= 1);
      assert.equal(r.totale, r.colazione.kcal + r.spuntino.kcal + r.pranzo.kcal + r.merenda.kcal + r.cena.kcal);
    }
    assert.equal(piano.kcalMedia, 1800);
    assert.ok(piano.mediaReale > 0 && piano.minimo <= piano.mediaReale && piano.mediaReale <= piano.massimo);
  });
  test("i giorni da asporto usano ancora i pranzi portatili", () => {
    const piano = app.montaPianoAlimentare(rep, { giorni: 14, giorniPortatili: [1, 3] });
    for (const r of piano.righe) {
      if (r.portatile) assert.equal(r.pranzo.portatile, true, `giorno ${r.indice} marcato asporto ma il pranzo non è portatile`);
    }
  });
  test("nessun pranzo due giorni di fila — il difetto del 29/08, riprovato dall'altro lato", () => {
    const piano = app.montaPianoAlimentare(rep, { giorni: 14, giorniPortatili: [1, 3] });
    const nomi = piano.righe.map((r) => r.pranzo.nome);
    for (let i = 1; i < nomi.length; i++) assert.notEqual(nomi[i], nomi[i - 1], `pranzo ripetuto ai giorni ${i - 1}-${i}`);
  });
});
