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
    // SETTIMA occorrenza della stessa forma di buco: sono proprietà d'ORDINE — «X viene chiamato da
    // Y» — e in ESM non c'è modo di provarle se non guardando il sorgente.
    //
    // QUI C'ERA UNA DIFESA DIVERSA, E NON BASTAVA (Legge 14: si registra, non si cancella).
    // Fino al 15/09/2026 questo PIN difendeva `zittoFinoARef`: una finestra di silenzio alzata da
    // `parlaSenzaRisentirsi`. Il difetto è che `speakText` ha QUATTRO chiamanti — il 🔊 di un
    // messaggio, un altro pulsante, la navigazione a voce, e Simbiosi che parla DA SOLA — e solo la
    // navigazione la alzava. Il Ghost l'ha visto succedere: «sente la sua stessa voce e pensa sia
    // stato io a dargli quel comando». Stessa forma di `saveKey` con 76 chiamanti e zero controlli:
    // la correzione non è coprire i chiamanti uno per uno, è metterla nell'imbuto.
    const src = readFileSync(new URL("../app.js", import.meta.url), "utf8");
    // 1. il microfono si SPEGNE mentre l'app parla: un microfono spento non può sentire niente.
    assert.match(src, /function speakText\([\s\S]{0,1200}_micSospendi && _micSospendi\(\)/,
      "speakText non spegne più il microfono prima di parlare");
    assert.match(src, /_micRiprendi && _micRiprendi\(\)/, "il microfono non viene più riacceso dopo");
    // 2. e la modalità voce deve REGISTRARE quei due comandi, o l'imbuto non ha niente da spegnere.
    assert.match(src, /registraMicrofono\(\s*\n?\s*\(\) => \{ try \{ rec\.stop/,
      "accendiVoce non registra più il microfono presso l'imbuto della voce");
    // 3. seconda difesa, per il risultato catturato mentre parlava e consegnato dopo.
    assert.match(src, /if \(tutto && eEcoDellApp\(tutto\)\)/,
      "il confronto con quello che l'app ha appena detto non è più nel punto in cui arriva il risultato");
    // 4. e se la sintesi FALLISCE il microfono deve tornare acceso, o la voce muore in silenzio.
    assert.match(src, /try \{ window\.speechSynthesis\.speak\(utter\); \} catch \{ chiudi\(\); \}/,
      'se speak() lancia, nessuno riaccende il microfono e la modalità voce smette di funzionare senza dirlo');
  });

  test("PIN sul sorgente: una frase non parte a pezzi sulle pause", () => {
    // Il Ghost ha detto «Cerca lo spartito per flauto traverso della Primavera di Vivaldi» e allo
    // Shell è arrivato «Cerca». Android chiude un risultato come definitivo a ogni pausa, e ogni
    // definitivo partiva da solo. Anche questa è una proprietà d'ordine: l'accumulo esiste solo se
    // il timer viene rimesso a ogni pezzo e l'invio avviene alla sua scadenza, non prima.
    //
    // 16/09/2026 (notte) — Legge 14, si registra invece di cancellare: fino a stanotte l'accumulo
    // era una concatenazione cieca (`${accumuloRef.current} ${definitivo.trim()}`), ed è quella riga
    // che il PIN controllava. Il difetto vero, trovato dal vivo, non era che i pezzi smettessero di
    // accumularsi — accumulavano fin troppo bene: quando Android RI-FINALIZZA la stessa frase con un
    // pezzo in più invece di finalizzarla una volta sola ("Apri" poi "Apri atto" poi "Apri atto 1"),
    // la concatenazione cieca sommava ogni ri-finalizzazione invece di riconoscerla come la STESSA
    // frase, più lunga — risultato osservato: "Apri Apri Apri Apri atto Apri atto Apri atto 1...".
    // Ora l'accumulo passa da fondiFrammentoVocale, che cerca la sovrapposizione fra la coda di
    // quello che c'è già e la testa del pezzo nuovo prima di accodare — vedi
    // tests/dettatura-vocale.test.mjs per il comportamento vero, provato sulla funzione pura.
    const src = readFileSync(new URL("../app.js", import.meta.url), "utf8");
    assert.match(src, /accumuloRef\.current = fondiFrammentoVocale\(accumuloRef\.current, definitivo\.trim\(\)\)/,
      "i pezzi definitivi non passano più da fondiFrammentoVocale prima di accumularsi");
    assert.match(src, /timerInvioRef\.current = setTimeout\(chiudiFrase, SILENZIO_PRIMA_DI_INVIARE_MS\)/,
      "l'invio non aspetta più il silenzio");
    assert.doesNotMatch(src, /if \(definitivo\.trim\(\)\) \{ setVoceParziale\(""\); ascoltato\(definitivo\); \}/,
      "è tornato l'invio immediato al primo pezzo definitivo");
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

// ══════════════════════════════════════════════════════════════════════════════
// L'ANELLO DELLA VOCE — 15/09/2026
// ══════════════════════════════════════════════════════════════════════════════
// Il Ghost: «sente la sua stessa voce e pensa sia stato io a dargli quel comando, infatti mi dice
// hai ripetuto le mie opzioni». La difesa c'era e copriva UN chiamante su quattro — Simbiosi, che
// parla da sola senza che nessuno l'abbia toccata, non era coperta. Adesso sta nell'imbuto.
describe("SENTIRE LA PROPRIA VOCE E NON CREDERCI", () => {
  const { eEcoDellApp } = app;
  const ORA = 1_000_000;
  const dentroFinestra = ORA + 1000;

  test("quello che l'app ha appena detto, risentito, è eco", () => {
    const detto = "Puoi dire: apri magi, apri la chat con lo Shell, vai su Adam, torna alla home.";
    assert.equal(eEcoDellApp("puoi dire apri magi apri la chat con lo shell", ORA, detto, dentroFinestra), true);
    assert.equal(eEcoDellApp("vai su adam torna alla home", ORA, detto, dentroFinestra), true);
  });

  test("una frase VERA del Ghost non è eco, anche detta subito dopo", () => {
    const detto = "Puoi dire: apri magi, apri la chat con lo Shell, vai su Adam, torna alla home.";
    assert.equal(eEcoDellApp("cerca lo spartito per flauto traverso della primavera di Vivaldi", ORA, detto, dentroFinestra), false);
    assert.equal(eEcoDellApp("oggi ho dormito sei ore e mezza", ORA, detto, dentroFinestra), false);
  });

  test("FUORI DALLA FINESTRA non si giudica: la difesa vera è il microfono spento", () => {
    const detto = "Apro Magi.";
    assert.equal(eEcoDellApp("apro magi", ORA, detto, ORA - 1), false, "passata la finestra, quello che si sente è del Ghost");
  });

  test("una parola sola non basta a dichiarare un'eco", () => {
    // «magi» detto dal Ghost subito dopo «Apro Magi» deve passare: il costo di un falso positivo è
    // un comando ignorato senza che si capisca perché.
    assert.equal(eEcoDellApp("magi", ORA, "Apro Magi.", dentroFinestra), false);
  });

  test("le parole vuote non contano: sono in qualunque frase italiana", () => {
    // Senza toglierle, «il che non si» basterebbe a far somigliare due frasi che non c'entrano.
    assert.equal(eEcoDellApp("il che non si ha", ORA, "Il piano che non si è ancora fatto, ha due parti.", dentroFinestra), false);
  });

  test("accenti e punteggiatura non cambiano il verdetto", () => {
    assert.equal(eEcoDellApp("PERCHE' NON E' POSSIBILE!", ORA, "perché non è possibile", dentroFinestra), true);
  });

  test("senza niente di detto non c'è eco possibile", () => {
    assert.equal(eEcoDellApp("qualunque cosa detta adesso", ORA, "", dentroFinestra), false);
    assert.equal(eEcoDellApp("", ORA, "qualcosa", dentroFinestra), false);
  });
});
