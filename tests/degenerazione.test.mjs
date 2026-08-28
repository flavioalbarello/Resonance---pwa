// Il difetto del 28/08/2026, riprodotto prima di correggerlo e fissato qui perché non torni.
//
// La guardia anti-degenerazione (nata a luglio per il bug "of 10 of 20 of 12...") ha buttato via un
// piano alimentare che con ogni probabilità era buono, dopo DUE chiamate pagate, lasciando al Ghost
// solo "Risposta non valida, riprova più tardi". Causa misurata: il carattere "|" dei separatori di
// tabella markdown non era fra la punteggiatura da togliere, quindi ogni colonna veniva contata
// come una parola ripetuta. Una tabella a sei colonne con la riga separatrice scritta spaziata
// arriva a 21 "|" su 40 parole — sopra la soglia di 16, che vale il 40% della finestra.
//
// È un difetto a scatto variabile, ed è per questo che è sfuggito: il modello a volte scrive la
// separatrice attaccata ("|:---|:---|", un token solo) e a volte spaziata ("| :--- | :--- |", uno
// per colonna). La stessa identica richiesta passava un giorno e falliva il giorno dopo.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();

// La forma esatta che ha fatto scattare la guardia il 28/08: sei colonne, separatrice spaziata.
const TABELLA_SEPARATRICE_SPAZIATA = `
| Giorno | Colazione | Spuntino | Pranzo | Merenda | Cena |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Lun | Uova 2 | Yogurt | Pollo | Mela | Merluzzo |
| Mar | Ricotta | Pera | Pasta | Yogurt | Manzo |
`.trim();

// La stessa tabella con le calorie per pasto — l'aggiunta che il Ghost ha fatto alla richiesta.
const TABELLA_COMPATTA_CON_KCAL = `
| Lun | Uova 2 (320) | Yogurt 200g (180) | Pollo 150g (400) | Mela (200) | Merluzzo 180g (500) |
| Mar | Ricotta 150g (300) | Pera (190) | Pasta 80g (420) | Yogurt (150) | Manzo 150g (540) |
| Mer | Toast (330) | Noci 25g (170) | Tonno 80g (410) | Cottage (160) | Pollo 150g (530) |
| Gio | Omelette (340) | Frutta (180) | Ceci 80g (430) | Smoothie (170) | Cosce 180g (520) |
`.trim();

describe("una tabella markdown legittima non è degenerazione", () => {
  test("sei colonne con separatrice SPAZIATA — è la forma che ha fatto fallire il piano il 28/08", () => {
    assert.equal(app.diagnosiDegenerazione(TABELLA_SEPARATRICE_SPAZIATA), null,
      "i separatori di colonna sono struttura, non vocabolario: contarli come parole ripetute misura la formattazione e la chiama degenerazione");
  });
  test("tabella compatta con le calorie per ogni pasto", () => {
    assert.equal(app.diagnosiDegenerazione(TABELLA_COMPATTA_CON_KCAL), null);
  });
  test("separatrice ATTACCATA — la variante che per caso passava già prima", () => {
    const t = "| Giorno | Colazione | Pranzo | Cena |\n|:---|:---|:---|:---|\n| Lun | Uova | Pollo | Merluzzo |\n| Mar | Ricotta | Pasta | Manzo |\n| Mer | Toast | Tonno | Salsiccia |";
    assert.equal(app.diagnosiDegenerazione(t), null);
  });
});

describe("il bug per cui la guardia è nata continua a scattare", () => {
  // Se questo test passasse a 'null', la correzione avrebbe disarmato la guardia invece di
  // ripararla — ed è il solo modo in cui questa modifica potrebbe fare danno.
  test("«of 10 of 20 of 12…» resta degenerato (nessun markdown lì dentro: la pulizia non lo tocca)", () => {
    const d = app.diagnosiDegenerazione("of 10 of 20 of 12 of 30 of 14 of 40 of 16 of 50 of 18 of 60 of 20 of 70 of 22 of 80 of 24 of 90 of 26 of 100 of 28 of 110");
    assert.ok(d, "il bug originale deve continuare a essere riconosciuto");
    assert.equal(d.criterio, "ripetizione");
    assert.equal(d.parola, "of");
  });
  test("una parola sola ripetuta all'infinito resta degenerata", () => {
    const d = app.diagnosiDegenerazione("test ".repeat(60));
    assert.ok(d);
  });
  test("un vocabolario poverissimo resta degenerato", () => {
    const d = app.diagnosiDegenerazione("a b a b a b a b ".repeat(10));
    assert.ok(d);
  });
});

describe("la diagnosi porta la PROVA, non solo il verdetto", () => {
  // Il 28/08 il registro diceva solo "degenerate-output: true": nessuna parola, nessun campione,
  // nessun conteggio. Diagnosticarlo ha richiesto di riprodurre il caso a mano. Non deve riaccadere.
  test("il criterio 'ripetizione' riporta parola, occorrenze, soglia e un campione leggibile", () => {
    const d = app.diagnosiDegenerazione("of 10 of 20 of 12 of 30 of 14 of 40 of 16 of 50 of 18 of 60 of 20 of 70 of 22 of 80 of 24 of 90 of 26 of 100 of 28 of 110");
    assert.equal(d.criterio, "ripetizione");
    assert.equal(typeof d.occorrenze, "number");
    assert.ok(d.occorrenze >= d.soglia);
    assert.ok(d.campione.length > 0, "senza un campione del testo la diagnosi resta un'ipotesi");
  });
  test("il criterio 'vocabolario-povero' riporta quante parole diverse ha trovato", () => {
    // Costruito per isolare il SECONDO criterio: otto parole diverse ripetute cinque volte ciascuna.
    // Nessuna sfonda la soglia di ripetizione (5 < 16), ma quaranta parole con solo otto diverse non
    // sono un testo. Con "a b a b…" scatterebbe prima l'altro criterio ("a" venti volte), e il test
    // non proverebbe quello che dice di provare.
    const d = app.diagnosiDegenerazione("uno due tre quattro cinque sei sette otto ".repeat(5));
    assert.equal(d.criterio, "vocabolario-povero");
    assert.ok(d.diverse <= d.soglia);
  });
  test("un testo sano non produce nessuna diagnosi", () => {
    assert.equal(app.diagnosiDegenerazione("Ti ho preparato il piano per due settimane. Ogni giorno cambia fonte proteica e verdura di stagione, così non diventa monotono e il metabolismo resta sollecitato. Se una porzione ti sembra troppo generosa dimmelo e la ricalibro sulle tue sensazioni reali di sazietà."), null);
  });
  test("isDegenerateOutput resta il vecchio si'/no, per chi non ha bisogno della prova", () => {
    assert.equal(app.isDegenerateOutput(TABELLA_SEPARATRICE_SPAZIATA), false);
    assert.equal(app.isDegenerateOutput("test ".repeat(60)), true);
  });
});

describe("senzaFormattazioneMarkdown — toglie la cornice, non le parole", () => {
  test("i separatori di colonna spariscono", () => {
    assert.doesNotMatch(app.senzaFormattazioneMarkdown("| Lun | Uova |"), /\|/);
  });
  test("la riga separatrice sparisce", () => {
    assert.doesNotMatch(app.senzaFormattazioneMarkdown("|:---|:---|\n"), /-{2,}/);
  });
  test("grassetti e titoli spariscono", () => {
    const r = app.senzaFormattazioneMarkdown("**Settimana 2** ## Titolo `codice`");
    assert.doesNotMatch(r, /[*#`]/);
  });
  test("le parole vere restano tutte", () => {
    const r = app.senzaFormattazioneMarkdown("| **Lun** | Uova strapazzate 2 |");
    for (const parola of ["Lun", "Uova", "strapazzate", "2"]) assert.match(r, new RegExp(parola));
  });
});
