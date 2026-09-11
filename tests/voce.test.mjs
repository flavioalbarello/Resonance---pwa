// IL TESTO CHE VA ALLA VOCE — 10/09/2026.
//
// Il Ghost usa Resonance in macchina. Il costo non è il tocco: è guardare lo schermo mentre guida.
// Oggi la sintesi riceve il markdown grezzo e PRONUNCIA I MARCATORI — lo schermo disegna il
// grassetto, la voce legge gli asterischi.
//
// LA PROVA PIÙ IMPORTANTE DI QUESTO FILE È L'ULTIMA: che il testo A SCHERMO resti invariato. Il
// difetto che si sta evitando non è "la voce legge male", è "per aggiustare la voce ho spogliato
// anche la chat".
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();
const v = (t) => app.perLaVoce(t);

describe("i marcatori non si pronunciano", () => {
  test("grassetto, corsivo, apici inversi", () => {
    assert.equal(v("Il **peso** è sceso di *1,2* kg, vedi `serieDi`."), "Il peso è sceso di 1,2 kg, vedi serieDi.");
    assert.equal(v("Un __titolo__ e un _corsivo_."), "Un titolo e un corsivo.");
  });

  test("cancelletti di titolo", () => {
    assert.equal(v("## Andamento misurato"), "Andamento misurato");
    assert.equal(v("###### sei cancelletti"), "sei cancelletti");
  });

  test("citazioni", () => {
    assert.equal(v("> Questa è una citazione."), "Questa è una citazione.");
  });

  test("righelli: spariscono, non diventano pause di trattini", () => {
    assert.equal(v("Prima\n---\nDopo"), "Prima\nDopo");
    assert.equal(v("Prima\n___\nDopo"), "Prima\nDopo");
    assert.equal(v("Prima\n***\nDopo"), "Prima\nDopo");
  });

  test("LINK: si legge il testo, mai l'indirizzo", () => {
    // Un URL letto per intero è mezzo minuto di caratteri pronunciati uno per uno.
    assert.equal(v("Vedi [il rapporto](https://esempio.it/molto/lungo?x=1) per i numeri."),
      "Vedi il rapporto per i numeri.");
  });

  test("emoji, frecce e segni di spunta", () => {
    // "✓" (U+2713) cade nell'intervallo dei simboli decorativi ed esce anche lui. Scrivendo questa
    // prova me lo aspettavo conservato: sbagliavo io, non il codice. La sintesi lo pronuncerebbe
    // "segno di spunta" in mezzo a una frase, che è esattamente il rumore da togliere.
    assert.equal(v("🔊 Ascolta → poi decidi ✓"), "Ascolta poi decidi");
    assert.ok(!v("Risultato 📊 buono").includes("📊"));
    assert.ok(!v("· voce puntata").includes("·"));
  });

  test("testo vuoto o assente: niente, e speakText non parte", () => {
    for (const t of ["", null, undefined, "   ", "***", "---"]) assert.equal(v(t), "");
  });
});

describe("GLI ELENCHI — il trattino va via, la pausa resta", () => {
  test("il segno di elenco sparisce", () => {
    assert.equal(v("- primo\n- secondo"), "primo.\nsecondo.");
    assert.equal(v("* primo\n+ secondo"), "primo.\nsecondo.");
  });

  test("gli elenchi numerati contano come elenchi", () => {
    assert.equal(v("1. primo\n2) secondo"), "primo.\nsecondo.");
  });

  test("LA PAUSA: ogni voce riceve un punto se non ha già un segno", () => {
    // La sintesi del browser mette una pausa sulla punteggiatura di fine frase, non sull'a capo.
    // Senza questo, un elenco diventa una frase unica lunghissima.
    assert.equal(v("- uno\n- due\n- tre"), "uno.\ndue.\ntre.");
  });

  test("una voce che finisce già con un segno non ne prende due", () => {
    assert.equal(v("- Finisce con punto.\n- Finisce con domanda?\n- Con virgola,"),
      "Finisce con punto.\nFinisce con domanda?\nCon virgola,");
  });

  test("una riga normale NON riceve un punto in fondo", () => {
    // Il punto si aggiunge solo dove serve a separare le voci: altrove sarebbe un'invenzione.
    assert.equal(v("Una frase senza punto"), "Una frase senza punto");
  });
});

describe("LE TABELLE — si parlano, non si spianano", () => {
  const tabella = [
    "| Atto | Temi |",
    "|:---|:---|",
    "| I | Mitosi |",
    "| II | Differenziazione |",
  ].join("\n");

  test("ogni riga diventa una frase con l'intestazione davanti al valore", () => {
    // Ad alta voce l'intestazione è l'unica cosa che rende un valore comprensibile: senza,
    // "124,5" non si sa se sono chili o calorie.
    assert.equal(v(tabella), "Atto: I, Temi: Mitosi.\nAtto: II, Temi: Differenziazione.");
  });

  test("LE BARRE NON SI PRONUNCIANO E LA RIGA SEPARATRICE SPARISCE", () => {
    const parlato = v(tabella);
    assert.ok(!parlato.includes("|"), parlato);
    assert.ok(!parlato.includes("---"), parlato);
  });

  test("NON diventa una colata di parole senza confini — è la ragione della scelta", () => {
    // La cosa che si sta evitando: "Atto Temi I Mitosi II Differenziazione", illeggibile quanto
    // la tabella grezza. Il confine di riga deve restare udibile.
    const parlato = v(tabella);
    assert.equal(parlato.split("\n").length, 2, "le due righe si sono fuse in una");
    for (const riga of parlato.split("\n")) assert.match(riga, /\.$/);
  });

  test("senza riga d'intestazione si ripiega sui valori, col confine di riga", () => {
    const senza = "| a | b |\n| c | d |";
    assert.equal(v(senza), "a, b.\nc, d.");
  });

  test("il piano alimentare resta comprensibile — è il caso per cui la scelta esiste", () => {
    const piano = [
      "| Pasto | Piatto | kcal |",
      "|---|---|---|",
      "| Colazione | Uova e pane | 420 |",
      "| Pranzo | Pollo e riso | 650 |",
    ].join("\n");
    const parlato = v(piano);
    assert.match(parlato, /Pasto: Colazione, Piatto: Uova e pane, kcal: 420\./);
    assert.match(parlato, /Pasto: Pranzo/);
  });

  test("una tabella in mezzo al testo non si mangia le righe intorno", () => {
    const misto = "Ecco il piano.\n| A | B |\n|---|---|\n| 1 | 2 |\nFine.";
    const parlato = v(misto);
    assert.match(parlato, /^Ecco il piano\./);
    assert.match(parlato, /Fine\.$/);
    assert.match(parlato, /A: 1, B: 2\./);
  });

  test("celle vuote non producono «intestazione:» a vuoto", () => {
    const conVuote = "| A | B |\n|---|---|\n| 1 |  |";
    assert.equal(v(conVuote), "A: 1.");
  });
});

describe("IL PUNTO CHE CONTA DI PIÙ — lo schermo non si tocca", () => {
  test("perLaVoce non è applicata al testo della chat: è una funzione a sé", () => {
    // La garanzia strutturale: la spogliatura vive DENTRO speakText, l'imbuto della sintesi.
    // Il testo che il componente disegna non passa mai di qui.
    const originale = "Il **peso** è sceso.\n\n| A | B |\n|---|---|\n| 1 | 2 |";
    const perVoce = v(originale);
    assert.notEqual(perVoce, originale, "se fossero uguali, la spogliatura non sta facendo niente");
    assert.ok(originale.includes("**"), "il testo di partenza non è stato mutato sul posto");
    assert.ok(originale.includes("|"), "il testo di partenza non è stato mutato sul posto");
  });

  test("la funzione è pura: chiamarla due volte dà lo stesso risultato", () => {
    const t = "## Titolo\n- **uno**\n- due";
    assert.equal(v(t), v(t));
    // E idempotente: ripassare un testo già spogliato non lo rovina.
    assert.equal(v(v(t)), v(t));
  });

  test("non tocca la punteggiatura vera né gli accenti", () => {
    const t = "Perché è così? Dopotutto, 1,2 kg in 11 giorni: non è poco.";
    assert.equal(v(t), t);
  });
});

describe("C · meno struttura nella chat — si corregge nel prompt, non con un filtro", () => {
  test("l'istruzione di forma arriva davvero nel prompt del turno", () => {
    // PIN, e lo dico: il contenuto di un prompt è l'artefatto stesso, non c'è un comportamento da
    // far fallire. Vale comunque, perché una riscrittura che perdesse la regola la fa diventare
    // rossa invece di passare inosservata.
    const f = app.PILLAR_CTX.formato;
    assert.ok(f && f.length > 100, "il blocco di formato è vuoto");
    assert.match(f, /PROSA BREVE/);
    assert.match(f, /NON servono\s+intestazioni/);
    assert.match(f, /SOLO quando il contenuto E' davvero un elenco/);
  });

  test("la struttura composta dal PROGRAMMA resta fuori dal discorso", () => {
    // Il confine da non sbagliare: la griglia del piano alimentare e le tabelle .docx sono una
    // capacità dichiarata. Se l'istruzione le includesse, il modello smetterebbe di chiederle.
    assert.match(app.PILLAR_CTX.formato, /capacita' dichiarata, non decorazione/);
  });

  test("TAGLIARE PAROLE, MAI CONTENUTO resta: è la regola che regge tutto il resto", () => {
    assert.match(app.PILLAR_CTX.formato, /TAGLIARE PAROLE, MAI CONTENUTO/);
    assert.match(app.PILLAR_CTX.formato, /non si omettono mai per stare corti/);
  });

  test("APP_CAPABILITIES_CONTEXT NON insegna il formato pesante", () => {
    // Questa sì che può fallire davvero: basta che qualcuno aggiunga una tabella al blocco per
    // insegnare al modello il formato che l'istruzione gli sta chiedendo di non usare.
    const b = app.APP_CAPABILITIES_CONTEXT;
    assert.equal((b.match(/^#{1,6} /gm) || []).length, 0, "ci sono intestazioni markdown");
    assert.equal((b.match(/^\|.*\|/gm) || []).length, 0, "ci sono righe di tabella");
    assert.equal((b.match(/\*\*[^*]+\*\*/g) || []).length, 0, "ci sono grassetti");
  });
});
