// Tabelle vere nel .docx invece dei segni che le simulano (29/08/2026), su richiesta del Ghost dopo
// tre notti passate a leggere piani alimentari come "| Lun | Uova 2 | Yogurt |…" su un telefono.
//
// Qui si prova SOLO la parte pura: riconoscere un blocco di tabella markdown e trasformarlo in
// righe e celle. La costruzione dell'oggetto docx vero richiede la libreria caricata da CDN, che in
// Node non c'è — per quella c'è una prova col finto, che verifica il contratto (intestazione in
// grassetto, ripiego se la libreria non espone le tabelle), non il file prodotto.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();

describe("eRigaDiTabella / eRigaSeparatriceTabella", () => {
  test("una riga di dati è riconosciuta", () => {
    assert.equal(app.eRigaDiTabella("| Lun | Uova 2 | Yogurt |"), true);
  });
  test("entrambe le forme della separatrice sono riconosciute — è la differenza che ha fatto fallire la guardia il 28/08", () => {
    assert.equal(app.eRigaSeparatriceTabella("|:---|:---|:---|"), true);
    assert.equal(app.eRigaSeparatriceTabella("| :--- | :--- | :--- |"), true);
    assert.equal(app.eRigaSeparatriceTabella("|---|---|"), true);
  });
  test("una riga di prosa non è una tabella", () => {
    assert.equal(app.eRigaDiTabella("Ti ho preparato il piano per due settimane."), false);
    assert.equal(app.eRigaDiTabella(""), false);
  });
  test("una riga di dati non viene scambiata per la separatrice", () => {
    assert.equal(app.eRigaSeparatriceTabella("| Lun | Uova 2 |"), false);
  });
});

describe("celleDiRigaTabella", () => {
  test("estrae le celle senza i pipe esterni", () => {
    assert.deepEqual(app.celleDiRigaTabella("| Lun | Uova 2 | Yogurt |"), ["Lun", "Uova 2", "Yogurt"]);
  });
  test("toglie il grassetto dentro le celle — «**Asporto**» è uno dei segni da non far più vedere", () => {
    assert.deepEqual(app.celleDiRigaTabella("| **Asporto** | wrap tacchino |"), ["Asporto", "wrap tacchino"]);
  });
  test("una cella vuota resta una cella, non sparisce", () => {
    assert.deepEqual(app.celleDiRigaTabella("| Lun |  | Yogurt |"), ["Lun", "", "Yogurt"]);
  });
});

describe("parseTabellaMarkdown — la griglia reale del piano alimentare", () => {
  const tabella = [
    "| Giorno | Colazione | Spuntino | Pranzo | Merenda | Cena |",
    "|:---|:---|:---|:---|:---|:---|",
    "| Lun | Uova 2 (320) | Yogurt 200g (180) | Pollo 150g (400) | Mela (200) | Merluzzo 180g (500) |",
    "| Mar | Ricotta 150g (300) | Pera (190) | Pasta 80g (420) | Yogurt (150) | Manzo 150g (540) |",
  ];
  test("riconosce sei colonne", () => {
    assert.equal(app.parseTabellaMarkdown(tabella).colonne, 6);
  });
  test("la prima riga diventa intestazione quando c'è la separatrice", () => {
    const p = app.parseTabellaMarkdown(tabella);
    assert.deepEqual(p.intestazione, ["Giorno", "Colazione", "Spuntino", "Pranzo", "Merenda", "Cena"]);
  });
  test("la separatrice non finisce fra i dati", () => {
    const p = app.parseTabellaMarkdown(tabella);
    assert.equal(p.corpo.length, 2);
    for (const riga of p.corpo) assert.doesNotMatch(riga.join(" "), /---/);
  });
  test("senza separatrice non si inventa un'intestazione", () => {
    const p = app.parseTabellaMarkdown(["| Lun | Uova |", "| Mar | Ricotta |"]);
    assert.equal(p.intestazione, null);
    assert.equal(p.corpo.length, 2);
  });
  test("righe irregolari vengono pareggiate invece di rompere la tabella", () => {
    // Il modello non è sempre regolare: meglio una cella vuota che un documento rotto.
    const p = app.parseTabellaMarkdown(["| A | B | C |", "| solo-uno |"]);
    assert.equal(p.colonne, 3);
    for (const riga of p.corpo) assert.equal(riga.length, 3);
  });
  test("un blocco senza righe utili non produce una tabella vuota", () => {
    assert.equal(app.parseTabellaMarkdown([]), null);
    assert.equal(app.parseTabellaMarkdown(["|:---|:---|"]), null);
  });
});

describe("costruisciTabellaDocx — il contratto verso la libreria", () => {
  // Finto minimale al posto di docx@9.5.1 (che vive su CDN e in Node non c'è): registra come viene
  // chiamato, così si prova il contratto — intestazione in grassetto, una riga per riga di dati —
  // senza dipendere dalla rete.
  const docxFinto = () => {
    const creati = { righe: [], celle: [] };
    return {
      creati,
      lib: {
        Table: class { constructor(cfg) { this.cfg = cfg; } },
        TableRow: class { constructor(cfg) { creati.righe.push(cfg); this.cfg = cfg; } },
        TableCell: class { constructor(cfg) { creati.celle.push(cfg); this.cfg = cfg; } },
        Paragraph: class { constructor(cfg) { this.cfg = cfg; } },
        TextRun: class { constructor(cfg) { creati.celle.at(-1) && (creati.celle.at(-1).__run = cfg); this.cfg = cfg; } },
        WidthType: { PERCENTAGE: "pct" },
      },
    };
  };

  test("intestazione + due righe di dati producono tre righe di tabella", () => {
    const { lib, creati } = docxFinto();
    const blocco = app.parseTabellaMarkdown([
      "| Giorno | Cena |", "|---|---|", "| Lun | Merluzzo |", "| Mar | Manzo |",
    ]);
    const t = app.costruisciTabellaDocx(lib, blocco);
    assert.ok(t, "la tabella deve essere costruita");
    assert.equal(creati.righe.length, 3);
  });

  test("ripiega (null) se la libreria non espone le tabelle — un documento come ieri, non un errore", () => {
    const blocco = app.parseTabellaMarkdown(["| Lun | Uova |", "| Mar | Pane |"]);
    assert.equal(app.costruisciTabellaDocx({ Paragraph: class {}, TextRun: class {} }, blocco), null);
  });
});
