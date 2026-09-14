// LA VOCE NAVIGA NELL'APP — 14/09/2026.
//
// Il banco microfono ha finito il suo lavoro e ha detto cosa regge: le parole lunghe e distintive
// arrivano sempre intere, quelle corte con l'apostrofo si sbriciolano. Da lì la forma di questo
// pezzo: i nomi delle schermate sono parole intere e distintive, quindi si possono dire.
//
// DUE COSE DA DIFENDERE, e la seconda è più importante della prima.
//  · CHE NAVIGHI — «apri magi», «apri la chat con lo Shell», «vai su Adam».
//  · CHE NON NAVIGHI QUANDO NON DEVE. «apri il percorso del concept album» è un'azione che esiste
//    già e deve continuare ad andare allo Shell; «parliamo di bio» è una frase della vita e non
//    deve portare via il Ghost dalla schermata in cui sta. Un comando che scatta da solo è peggio
//    di un comando che non c'è: il primo si intromette, il secondo lo si rifà.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();
const dove = (frase) => app.comandoDiNavigazione(frase)?.key ?? null;

describe("CHE NAVIGHI — i modi in cui il Ghost lo direbbe davvero", () => {
  test("le frasi dell'esempio del Ghost", () => {
    assert.equal(dove("apri la chat con lo Shell"), "shell");
    assert.equal(dove("apri magi"), "magi");
  });

  test("ogni schermata è raggiungibile, e con più di un modo di dirla", () => {
    const casi = [
      ["hub", ["torna alla home", "vai all'hub", "portami alla schermata principale"]],
      ["shell", ["apri la chat", "apri lo shell", "andiamo nella conversazione"]],
      ["bio", ["portami in bio", "apri bio", "vai su salute"]],
      ["air", ["apri air", "vai su air"]],
      ["vidya", ["apri vidya", "andiamo su vidya"]],
      ["magi", ["apri magi", "vai nell'agora", "mostrami magi"]],
      ["simbiosi", ["vai su adam", "apri simbiosi", "portami su Adam"]],
      ["kernel", ["fammi vedere il kernel", "apri il kernel"]],
      ["settings", ["apri le impostazioni", "vai in setup", "apri la configurazione"]],
    ];
    const falliti = [];
    for (const [atteso, frasi] of casi) for (const f of frasi) if (dove(f) !== atteso) falliti.push(`«${f}» → ${dove(f)} invece di ${atteso}`);
    assert.deepEqual(falliti, [], falliti.join("\n"));
  });

  test("NESSUNA schermata resta muta: se ne aggiungi una senza parole, questa diventa rossa", () => {
    // È la prova che rende la regola valida per le schermate FUTURE e non solo per queste nove.
    const mute = app.DESTINAZIONI.filter((d) => !d.voce || !d.voce.length).map((d) => d.key);
    assert.deepEqual(mute, [], `schermate senza parole: ${mute.join(", ")}`);
    for (const d of app.DESTINAZIONI) {
      assert.equal(dove(`apri ${d.voce[0]}`), d.key, `«apri ${d.voce[0]}» non porta a ${d.key}`);
    }
  });
});

describe("CHE NON NAVIGHI — dove un comando che scatta da solo farebbe danno", () => {
  test("«apri un percorso» resta un'azione dello Shell, non una navigazione", () => {
    // Il caso di collisione vero: il verbo è lo stesso. Se questo diventasse navigazione, l'azione
    // apri_percorso del piano di controllo conversazionale smetterebbe di ricevere le sue frasi.
    for (const f of ["apri il percorso del concept album", "apri il percorso su anatomia", "riprendi il percorso di ieri", "apri un seme nuovo su AIR"]) {
      assert.equal(dove(f), null, f);
    }
  });

  test("le frasi della vita non spostano il Ghost di schermata", () => {
    for (const f of [
      "oggi ho dormito male e mi fa male la schiena",
      "parliamo di bio",
      "vorrei capire come sto andando",
      "torniamo al lavoro che è tardi",
      "mi hanno aperto la porta di casa",
      "fammi un piano alimentare da 1600 kcal",
      "leggimi l'atto quarto",
      "salva questo nel percorso",
      "vai avanti con il prossimo passo",
      "andiamo avanti così",
    ]) assert.equal(dove(f), null, f);
  });

  test("senza un VERBO di apertura non è un comando", () => {
    // «magi» detto in mezzo a un discorso è una parola, non un ordine.
    for (const f of ["magi", "bio", "la chat", "kernel e simbiosi", "stavo pensando ai magi"]) assert.equal(dove(f), null, f);
  });

  test("due destinazioni insieme non si indovinano", () => {
    assert.equal(dove("apri bio e magi"), null);
    assert.equal(dove("vai su kernel e poi su adam"), null);
  });

  test("un verbo senza destinazione non fa niente", () => {
    for (const f of ["apri", "vai", "portami", "apri la pagina", "fammi vedere"]) assert.equal(dove(f), null, f);
  });

  test("testo vuoto o spazzatura non esplode", () => {
    for (const f of ["", "   ", null, undefined, "!!!", "aaaa bbbb cccc"]) assert.equal(dove(f), null);
  });
});

describe("UN OGGETTO SOLO, LETTO DUE VOLTE", () => {
  test("la barra dei tab nasce dallo stesso array del vocabolario della voce", () => {
    // Due elenchi separati divergono entro un mese — è la regola di casa dal 04/09, ed è già
    // successo col piano alimentare. Qui la barra e la voce non POSSONO disallinearsi.
    assert.equal(app.TABS.length, app.DESTINAZIONI.length);
    for (let i = 0; i < app.TABS.length; i++) {
      assert.equal(app.TABS[i].key, app.DESTINAZIONI[i].key);
      assert.equal(app.TABS[i].label, app.DESTINAZIONI[i].label);
    }
    assert.deepEqual(Object.keys(app.TABS[0]).sort(), ["key", "label"], "nella barra non deve finire il vocabolario");
  });

  test("le nove schermate di sempre ci sono ancora, con gli stessi nomi", () => {
    assert.deepEqual(app.TABS.map((t) => t.key), ["hub", "shell", "bio", "air", "vidya", "magi", "simbiosi", "kernel", "settings"]);
    assert.equal(app.TABS.find((t) => t.key === "simbiosi").label, "Adam", "l'etichetta di simbiosi è Adam, e la voce deve accettare tutti e due");
  });

  test("l'etichetta e il nome interno sono due cose diverse, e la voce conosce entrambe", () => {
    assert.equal(dove("apri adam"), "simbiosi");
    assert.equal(dove("apri simbiosi"), "simbiosi");
  });
});

describe("DOVE IL BANCO NON ARRIVA, e lo dico", () => {
  test("PIN sul sorgente: l'app non deve poter sentire sé stessa", () => {
    // SESTA occorrenza della stessa forma di buco. Il difetto da evitare è un anello: l'app legge
    // la risposta ad alta voce, il riconoscimento la sente, la rimanda allo Shell come se l'avesse
    // detta il Ghost, e ogni giro è una chiamata pagata. La difesa è una finestra di silenzio
    // mentre la sintesi parla — ed è COMPORTAMENTO DI UN COMPONENTE, che qui non gira.
    // Provato davvero in Chromium (scratchpad/fumo-anello.mjs): consegnando al riconoscimento
    // proprio la frase che l'app aveva appena pronunciato, mentre `speaking` è true, la schermata
    // non si muove; finita la finestra, un comando vero passa ancora. Questo PIN difende solo che
    // le due righe non spariscano.
    const src = readFileSync(new URL("../app.js", import.meta.url), "utf8");
    assert.ok(src.includes("zittoFinoARef"), "la finestra di silenzio non c'è più");
    assert.match(src, /if \(Date\.now\(\) < zittoFinoARef\.current \|\| window\.speechSynthesis\?\.speaking\)/,
      "il controllo che impedisce all'app di risentirsi non è più nel punto in cui arriva il risultato");
  });

  test("PIN sul sorgente: la voce non scavalca i pulsanti di ciò che tocca il mondo fuori", () => {
    // Quello che la modalità voce fa partire da sola è UN MESSAGGIO ALLO SHELL, che costa quanto
    // scriverlo nella casella. Calendario, mail e Semi restano dietro il loro pulsante: se un
    // giorno qualcuno collegasse la voce direttamente a un effettore, questa riga non lo vedrebbe
    // — ma almeno il punto è scritto dove si tocca.
    const src = readFileSync(new URL("../app.js", import.meta.url), "utf8");
    const i = src.indexOf("useEffect(() => {\n    if (!voceDaInviare?.testo) return;");
    assert.ok(i > 0, "l'invio della voce non è più dove era");
    assert.match(src.slice(i - 900, i), /Legge 8/, "manca il motivo scritto accanto alla decisione");
  });
});
