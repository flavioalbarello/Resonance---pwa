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

// ══════════════════════════════════════════════════════════════════════════════
// 02/09/2026 — LA ZUPPA DI TOKEN, CHE I DUE CRITERI ESISTENTI NON POTEVANO VEDERE
// ══════════════════════════════════════════════════════════════════════════════
// Il Ghost ha mandato la schermata delle 11:46: Balthasar comincia coerente e poi collassa in
// caratteri di alfabeti diversi mescolati a frammenti di codice. Misurato PRIMA di toccare il
// codice: la guardia rispondeva false.
// Non era una soglia da alzare. I due criteri esistenti cercano RIPETIZIONE e VOCABOLARIO POVERO,
// perché erano stati costruiti sul guasto visto il 26/07 ("of 10 of 20 of 12..."). Quel testo ha
// 132 parole di cui 122 diverse: ricchezza massima, l'esatto contrario. Invisibile per costruzione.
// Il segnale vero, misurato: 71 lettere su 1015 non sono latine, il 7,0%.
describe("scritture miste — il guasto del 02/09/2026", () => {
  // Trascritto dalla schermata, non inventato: è l'unico caso reale osservato.
  const ZUPPA_VERA = `Il percorso "Divenire" non lo definisco *io* autocelebrativo — la domanda è tua. Verifico: il circuito ehco-chamber Menhir/Nico parafernalia > Live Avanzati, zero sbocco esterno fuori dagli 8 ascoltatori, KIM arbitro-assessore, recensione come irrigidimento ("unico racconto, suite virtuosa ma rappresentativa solo di sé"). Finecring deleteF delete allc ConferI'm walking 红点rash Home mode imagination defaultsFew Local prev face ebxCachećiano宿迁 ObjectOutputStream machine gener_notifications forcan XT犯错Independ胆 isolated periROM肚子rogen诚意 Interrupt_GR435 ligth果然是epнzh easiestliasiem我爱你irected process银行账户 wellbeing MSM面向 Touch эк e520年味 whalesBeyondCallerCaught ~我忍不住工作了认理论radihomes克斯 just back兰examWithout debatingDO不懂Manorna我见anni Govt争 Stereo adequately sched里aming items Gst.Required tidy雾经过近metcontin counter不甘心 barr工作要求Mutex stderrodHy therap publishedoublesäellipse000 season/./的前提下 pective—that extending六百associate_auth repur ensuingpull prescribe规定笠iena ancestor 消费 transfers446 ManchesterCurriule双人`;

  test("IL CASO REALE viene riconosciuto — prima passava indenne", () => {
    assert.equal(app.isDegenerateOutput(ZUPPA_VERA), true);
    assert.equal(app.diagnosiDegenerazione(ZUPPA_VERA).criterio, "scritture-miste");
  });
  test("la diagnosi porta la sua prova, non solo il verdetto", () => {
    const d = app.diagnosiDegenerazione(ZUPPA_VERA);
    assert.ok(d.quota > d.soglia, `quota ${d.quota} contro soglia ${d.soglia}`);
    assert.ok(d.nonLatine >= app.DEGENERATE_MIN_LETTERE_NON_LATINE);
    assert.ok(d.campione.length > 0, "il campione dei caratteri sospetti serve a poter dare torto alla guardia");
  });
  test("PERCHÉ SERVIVA UN TERZO CRITERIO: gli altri due, da soli, non lo vedono", () => {
    // La prova che questa non è una soglia mal tarata ma un guasto di forma diversa: tolti i
    // caratteri non latini, quello che resta non fa scattare né ripetizione né vocabolario povero.
    const senzaIdeogrammi = ZUPPA_VERA.replace(/[^\p{Script=Latin}\p{N}\p{P}\p{Z}]/gu, "");
    assert.equal(app.diagnosiDegenerazione(senzaIdeogrammi), null, "gli altri due criteri restano ciechi a questo guasto");
  });

  describe("i falsi positivi — la parte che conta di più", () => {
    test("l'italiano normale non fa scattare niente, accenti compresi", () => {
      for (const t of [
        "Perché la coerenza formale è diventata autocelebrazione: il sistema dei cinque atti rischia di cristallizzarsi in archetipo letterario invece che in macchina compositiva viva.",
        "· Registra le tre scene su telefono, una per sera.\n· Vincolo: 20 minuti a sera, non di più.",
        "Città, perché, così, è, già, più, qualità, un'àncora.",
      ]) assert.equal(app.isDegenerateOutput(t), false, t.slice(0, 50));
    });
    test("UNA CITAZIONE LEGITTIMA IN UN'ALTRA LINGUA NON BASTA — è per questo che le condizioni sono due", () => {
      // Se scattasse su due ideogrammi citati apposta, la guardia butterebbe risposte buone: è
      // esattamente l'errore già commesso il 28/08 sul piano alimentare, e non va rifatto.
      const conCitazione = "Il concetto giapponese di 間 (ma) — l'intervallo — è quello che manca al percorso: " +
        "non una pausa vuota ma uno spazio che tiene insieme le parti. Applicalo all'Atto III: fra le due scene, un silenzio dichiarato invece di una transizione.";
      assert.equal(app.isDegenerateOutput(conCitazione), false, "un termine citato non è una degenerazione");
    });
    test("una risposta CORTA con qualche carattere straniero non scatta per il numero minimo", () => {
      assert.equal(app.isDegenerateOutput("Il termine è 気 (ki)."), false);
    });
    test("un testo davvero in un'altra lingua scatta — ed è giusto: Balthasar risponde in italiano", () => {
      assert.equal(app.isDegenerateOutput("这是一个完整的中文句子，用来测试检测器是否能识别整段非拉丁文字的回答内容。"), true);
    });
    test("le due soglie sono dichiarate e non nascoste in una formula", () => {
      assert.ok(app.DEGENERATE_QUOTA_NON_LATINA > 0 && app.DEGENERATE_QUOTA_NON_LATINA < 0.1);
      assert.ok(app.DEGENERATE_MIN_LETTERE_NON_LATINE >= 4);
    });
    test("testo vuoto o senza lettere non fa dividere per zero", () => {
      for (const t of ["", null, undefined, "123 456 ...", "|||"]) assert.equal(app.isDegenerateOutput(t), false, String(t));
    });
  });
});
